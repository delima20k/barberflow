'use strict';

// =============================================================
// MediaCacheService.js — Cache local de mídia via IndexedDB.
//
// RESPONSABILIDADE:
//   Armazenar buffers de mídia localmente no dispositivo do usuário.
//   Elimina re-downloads de arquivos já visualizados e alimenta o
//   sistema P2P WebRTC como fonte de dados para redistribuição.
//
// BANCO:    barberflow-media (IndexedDB)
// STORE:    arquivos
// SCHEMA:   { mediaId (key), buffer: ArrayBuffer, mimeType, bytes, cachedAt, expiresAt }
//
// TTL padrão:
//   Imagens: 24 horas
//   Vídeos/áudio: 1 hora (arquivos maiores — rotatividade maior)
//
// ÍNDICE EM MEMÓRIA:
//   #indices (Map<mediaId, expiresAt>) — permite temCache() síncrono sem I/O
//   Populado na abertura do banco. Limpo quando o TTL expira.
//
// API:
//   MediaCacheService.salvar(mediaId, buffer, { mimeType, ttlMs })
//   MediaCacheService.obter(mediaId) → ArrayBuffer | null
//   MediaCacheService.temCache(mediaId) → boolean (síncrono)
//   MediaCacheService.limpar(maxAgeMs?) — purga entradas expiradas
//   MediaCacheService.suportado() → boolean
//
// USO:
//   // Cachear após download:
//   await MediaCacheService.salvar('abc', buffer, { mimeType: 'image/webp' });
//
//   // Verificar antes de baixar (síncrono):
//   if (MediaCacheService.temCache('abc')) {
//     const buf = await MediaCacheService.obter('abc');
//   }
//
// Dependências: IndexedDB (browser nativo) — zero libs externas
// =============================================================

class MediaCacheService {

  // ── Constantes privadas ────────────────────────────────────────
  static #DB_NAME    = 'barberflow-media';
  static #DB_VERSION = 1;
  static #STORE_NAME = 'arquivos';

  /** TTL padrão para imagens (24 horas) */
  static #TTL_IMAGEM_MS = 24 * 60 * 60 * 1000;

  /** TTL padrão para vídeos/áudio (1 hora) */
  static #TTL_MEDIA_MS = 60 * 60 * 1000;

  /** Índice em memória: mediaId → expiresAt (ms). Permite temCache() síncrono. */
  static #indices = new Map();

  /** Promessa de abertura do banco (singleton). */
  static #dbPromise = null;

  // ══════════════════════════════════════════════════════════════
  // Público
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se o IndexedDB está disponível neste ambiente.
   * @returns {boolean}
   */
  static suportado() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /**
   * Verifica (síncrono, sem I/O) se há uma entrada em cache e ainda não expirou.
   * @param {string} mediaId
   * @returns {boolean}
   */
  static temCache(mediaId) {
    const expira = MediaCacheService.#indices.get(mediaId);
    if (!expira) return false;
    if (Date.now() > expira) {
      MediaCacheService.#indices.delete(mediaId);
      return false;
    }
    return true;
  }

  /**
   * Armazena um buffer no cache local com TTL.
   * Se a entrada já existir, substitui (upsert).
   *
   * @param {string}      mediaId  — identificador único do arquivo
   * @param {ArrayBuffer} buffer   — conteúdo do arquivo
   * @param {object}      opts
   * @param {string}      opts.mimeType — MIME type (ex: 'image/webp', 'video/mp4')
   * @param {number}      [opts.ttlMs]  — TTL em milissegundos; padrão automático por MIME
   * @returns {Promise<void>}
   */
  static async salvar(mediaId, buffer, { mimeType, ttlMs } = {}) {
    if (!MediaCacheService.suportado()) return;
    if (!mediaId || !(buffer instanceof ArrayBuffer)) return;

    const ttl       = ttlMs ?? MediaCacheService.#ttlPorMime(mimeType ?? '');
    const expiresAt = Date.now() + ttl;
    const entrada   = {
      mediaId,
      buffer,
      mimeType: mimeType ?? 'application/octet-stream',
      bytes:    buffer.byteLength,
      cachedAt: Date.now(),
      expiresAt,
    };

    const db    = await MediaCacheService.#abrirBanco();
    const store = MediaCacheService.#transacao(db, 'readwrite');
    await MediaCacheService.#promessa(store.put(entrada));

    // Atualiza índice em memória
    MediaCacheService.#indices.set(mediaId, expiresAt);
  }

  /**
   * Recupera um buffer do cache.
   * Retorna `null` se a entrada não existir ou estiver expirada.
   *
   * @param {string} mediaId
   * @returns {Promise<ArrayBuffer|null>}
   */
  static async obter(mediaId) {
    if (!MediaCacheService.suportado() || !mediaId) return null;

    const db      = await MediaCacheService.#abrirBanco();
    const store   = MediaCacheService.#transacao(db, 'readonly');
    const entrada = await MediaCacheService.#promessa(store.get(mediaId));

    if (!entrada) return null;

    // Verificar TTL
    if (Date.now() > entrada.expiresAt) {
      MediaCacheService.#indices.delete(mediaId);
      // Remover entrada expirada em background (fire-and-forget)
      MediaCacheService.#removerAsync(mediaId);
      return null;
    }

    return entrada.buffer;
  }

  /**
   * Remove entradas expiradas do banco.
   * Se `maxAgeMs` não for informado, usa o TTL de cada entrada individualmente.
   *
   * @param {number} [maxAgeMs] — se informado, remove entradas mais antigas que maxAgeMs ms
   * @returns {Promise<number>} quantidade de entradas removidas
   */
  static async limpar(maxAgeMs) {
    if (!MediaCacheService.suportado()) return 0;

    const db      = await MediaCacheService.#abrirBanco();
    const store   = MediaCacheService.#transacao(db, 'readwrite');
    const agora   = Date.now();
    const cursor  = store.openCursor();
    let removidas = 0;

    await new Promise((resolve, reject) => {
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) { resolve(); return; }

        const { mediaId, expiresAt, cachedAt } = c.value;
        const expirou = agora > expiresAt;
        const muitoAntigo = maxAgeMs != null && (agora - cachedAt) > maxAgeMs;

        if (expirou || muitoAntigo) {
          c.delete();
          MediaCacheService.#indices.delete(mediaId);
          removidas++;
        }
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });

    return removidas;
  }

  // ══════════════════════════════════════════════════════════════
  // Privados
  // ══════════════════════════════════════════════════════════════

  /**
   * Abre (ou retorna existente) a conexão com o IndexedDB.
   * Singleton: uma única promessa por ciclo de vida da página.
   * @returns {Promise<IDBDatabase>}
   */
  static #abrirBanco() {
    if (MediaCacheService.#dbPromise) return MediaCacheService.#dbPromise;

    MediaCacheService.#dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(MediaCacheService.#DB_NAME, MediaCacheService.#DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db    = e.target.result;
        const store = db.createObjectStore(MediaCacheService.#STORE_NAME, { keyPath: 'mediaId' });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      };

      req.onsuccess = async (e) => {
        const db = e.target.result;
        // Popular índice em memória com entradas ainda válidas
        await MediaCacheService.#carregarIndices(db);
        resolve(db);
      };

      req.onerror = () => reject(req.error);
    });

    return MediaCacheService.#dbPromise;
  }

  /**
   * Carrega todos os mediaIds válidos para o índice em memória.
   * Chamado uma única vez após abertura do banco.
   * @param {IDBDatabase} db
   */
  static async #carregarIndices(db) {
    const store  = MediaCacheService.#transacao(db, 'readonly');
    const agora  = Date.now();
    const cursor = store.openCursor();

    await new Promise((resolve) => {
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) { resolve(); return; }
        const { mediaId, expiresAt } = c.value;
        if (agora <= expiresAt) {
          MediaCacheService.#indices.set(mediaId, expiresAt);
        }
        c.continue();
      };
      cursor.onerror = () => resolve(); // fail silently — índice ficará incompleto mas funcional
    });
  }

  /**
   * Retorna a object store de uma nova transação.
   * @param {IDBDatabase} db
   * @param {'readonly'|'readwrite'} modo
   * @returns {IDBObjectStore}
   */
  static #transacao(db, modo) {
    return db.transaction(MediaCacheService.#STORE_NAME, modo)
      .objectStore(MediaCacheService.#STORE_NAME);
  }

  /**
   * Envolve um IDBRequest em uma Promise.
   * @param {IDBRequest} req
   * @returns {Promise<any>}
   */
  static #promessa(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Remove uma entrada do banco em background (sem await).
   * @param {string} mediaId
   */
  static async #removerAsync(mediaId) {
    try {
      const db    = await MediaCacheService.#abrirBanco();
      const store = MediaCacheService.#transacao(db, 'readwrite');
      store.delete(mediaId);
    } catch (_) { /* silencioso — operação de limpeza */ }
  }

  /**
   * Determina o TTL apropriado baseado no MIME type.
   * Vídeos e áudio têm TTL menor (arquivos maiores, rotatividade maior).
   * @param {string} mimeType
   * @returns {number} TTL em milissegundos
   */
  static #ttlPorMime(mimeType) {
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      return MediaCacheService.#TTL_MEDIA_MS;
    }
    return MediaCacheService.#TTL_IMAGEM_MS;
  }
}
