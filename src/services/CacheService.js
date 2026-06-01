'use strict';

// =============================================================
// CacheService.js — Cache de dados em memória ou disco com TTL.
// Camada: infra
//
// RESPONSABILIDADE ÚNICA:
//   Armazenamento temporário de Buffers com expiração automática
//   por TTL e deduplicação de requisições concorrentes (coalescing).
//
// MODOS:
//   'memory' — Map em processo. Rápido, volátil entre reinicializações.
//   'disk'   — Arquivos binários + metadados JSON em diretório configurável.
//              Sobrevive a reinicializações; usa sha256(key) como nome.
//
// TTL:
//   Padrão: 5 minutos. Entradas expiradas são descartadas lazily na leitura.
//
// DEDUPLICAÇÃO:
//   getOrFetch(key, fetchFn) — se a mesma chave estiver em-flight,
//   reutiliza a Promise existente (nenhum fetchFn duplicado é disparado).
//
// USO:
//   const cache = new CacheService({ mode: 'memory', ttl: 60_000 });
//
//   // set/get/has diretos:
//   cache.set('img:42', buffer);
//   const buf = cache.get('img:42');   // Buffer | null
//   cache.has('img:42');               // true | false
//
//   // Fetch com dedup:
//   const data = await cache.getOrFetch('img:42', () => fetchFromStorage('42'));
//
// Dependências: node:fs, node:path, node:crypto, node:os (todas nativas)
// =============================================================

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');
const os     = require('node:os');

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos em ms
const DEFAULT_DIR = path.join(os.tmpdir(), 'barberflow-cache');

class CacheService {

  #ttl;
  #mode;
  #dir;
  #store;    // Map<string, { data: Buffer, expiresAt: number }> — apenas memory
  #inflight; // Map<string, Promise<Buffer>> — deduplicação de fetches em-flight

  /**
   * @param {object} [opts]
   * @param {number}          [opts.ttl=300000] — TTL em milissegundos (padrão 5 min)
   * @param {'memory'|'disk'} [opts.mode='memory']
   * @param {string}          [opts.dir]        — diretório raiz para modo disk
   */
  constructor({ ttl = DEFAULT_TTL, mode = 'memory', dir } = {}) {
    if (typeof ttl !== 'number' || ttl <= 0) {
      throw new RangeError('[CacheService] ttl deve ser um número positivo');
    }
    if (mode !== 'memory' && mode !== 'disk') {
      throw new TypeError('[CacheService] mode deve ser "memory" ou "disk"');
    }

    this.#ttl      = ttl;
    this.#mode     = mode;
    this.#store    = new Map();
    this.#inflight = new Map();

    if (mode === 'disk') {
      this.#dir = dir ?? DEFAULT_DIR;
      fs.mkdirSync(this.#dir, { recursive: true });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Retorna o Buffer armazenado ou null se ausente/expirado.
   * @param {string} key
   * @returns {Buffer|null}
   */
  get(key) {
    this.#validarChave(key);
    return this.#mode === 'memory' ? this.#getMemory(key) : this.#getDisk(key);
  }

  /**
   * Armazena um Buffer com o TTL configurado.
   * @param {string} key
   * @param {Buffer} data
   */
  set(key, data) {
    this.#validarChave(key);
    if (!Buffer.isBuffer(data)) {
      throw new TypeError('[CacheService] data deve ser um Buffer');
    }
    if (this.#mode === 'memory') {
      this.#setMemory(key, data);
    } else {
      this.#setDisk(key, data);
    }
  }

  /**
   * Verifica se a chave existe e não está expirada.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    this.#validarChave(key);
    return this.get(key) !== null;
  }

  /**
   * Retorna o cache se presente; caso contrário executa fetchFn.
   * Chamadas concorrentes com a mesma chave em-flight reutilizam a mesma Promise
   * (nenhum fetchFn duplicado é disparado).
   *
   * @param {string} key
   * @param {() => Promise<Buffer>} fetchFn — produtor do Buffer
   * @returns {Promise<Buffer>}
   */
  async getOrFetch(key, fetchFn) {
    this.#validarChave(key);
    if (typeof fetchFn !== 'function') {
      throw new TypeError('[CacheService] fetchFn deve ser uma função');
    }

    const cached = this.get(key);
    if (cached !== null) return cached;

    // Retorna a Promise já em-flight para deduplicar chamadas concorrentes
    if (this.#inflight.has(key)) return this.#inflight.get(key);

    const promise = Promise.resolve()
      .then(() => fetchFn())
      .then((data) => {
        this.set(key, data);
        this.#inflight.delete(key);
        return data;
      })
      .catch((err) => {
        this.#inflight.delete(key);
        throw err;
      });

    this.#inflight.set(key, promise);
    return promise;
  }

  /**
   * Remove a entrada da chave explicitamente.
   * @param {string} key
   */
  delete(key) {
    this.#validarChave(key);
    if (this.#mode === 'memory') {
      this.#store.delete(key);
    } else {
      const base = this.#filePath(key);
      try { fs.unlinkSync(`${base}.data`); } catch (_) {}
      try { fs.unlinkSync(`${base}.meta`); } catch (_) {}
    }
  }

  /**
   * Remove todas as entradas do cache.
   */
  clear() {
    if (this.#mode === 'memory') {
      this.#store.clear();
    } else {
      try {
        for (const f of fs.readdirSync(this.#dir)) {
          if (f.endsWith('.data') || f.endsWith('.meta')) {
            try { fs.unlinkSync(path.join(this.#dir, f)); } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO — modo memory
  // ══════════════════════════════════════════════════════════════

  #getMemory(key) {
    const entry = this.#store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      return null;
    }
    return entry.data;
  }

  #setMemory(key, data) {
    this.#store.set(key, { data, expiresAt: Date.now() + this.#ttl });
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO — modo disk
  // ══════════════════════════════════════════════════════════════

  #getDisk(key) {
    const base = this.#filePath(key);
    try {
      const meta = JSON.parse(fs.readFileSync(`${base}.meta`, 'utf8'));
      if (Date.now() > meta.expiresAt) {
        try { fs.unlinkSync(`${base}.data`); } catch (_) {}
        try { fs.unlinkSync(`${base}.meta`); } catch (_) {}
        return null;
      }
      return fs.readFileSync(`${base}.data`);
    } catch (_) {
      return null;
    }
  }

  #setDisk(key, data) {
    const base = this.#filePath(key);
    const meta = JSON.stringify({ expiresAt: Date.now() + this.#ttl });
    fs.writeFileSync(`${base}.data`, data);
    fs.writeFileSync(`${base}.meta`, meta, 'utf8');
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO — helpers
  // ══════════════════════════════════════════════════════════════

  /** Gera caminho de arquivo a partir do SHA-256 da chave. */
  #filePath(key) {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.#dir, hash);
  }

  #validarChave(key) {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new TypeError('[CacheService] key deve ser uma string não-vazia');
    }
  }
}

module.exports = CacheService;
