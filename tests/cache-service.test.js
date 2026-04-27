'use strict';

// =============================================================
// tests/cache-service.test.js
//
// Testes: CacheService
// Runner: node:test + node:assert/strict (nativo)
//
// Cenários cobertos:
//
//   Modo memory:
//     1. set/get retorna o buffer original
//     2. has() retorna true para chave presente
//     3. has() retorna false para chave ausente
//     4. Arquivo em cache → recuperação mais rápida que fetch fresco
//     5. Cache expirado → get retorna null
//     6. Cache expirado → has() retorna false
//     7. Chamadas concorrentes → fetchFn executada apenas uma vez
//     8. delete() remove a entrada
//     9. clear() esvazia todo o cache
//    10. getOrFetch propaga erro do fetchFn
//
//   Modo disk:
//    11. set/get persiste e lê corretamente do disco
//    12. Cache expirado em disco → get retorna null e arquivos removidos
//    13. Chamadas concorrentes em disk → fetchFn executada apenas uma vez
//    14. clear() remove arquivos em disco
//    15. delete() remove arquivos em disco
//
//   Validação de entradas:
//    16. key não-string → TypeError
//    17. key vazia → TypeError
//    18. key somente espaços → TypeError
//    19. data não-Buffer → TypeError
//    20. ttl <= 0 → RangeError no construtor
//    21. mode inválido → TypeError no construtor
//    22. fetchFn não-função → TypeError
// =============================================================

const { describe, it } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('node:fs');
const path    = require('node:path');
const os      = require('node:os');

const CacheService = require('../src/services/CacheService');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Cria um Buffer a partir de uma string. */
const buf = (s) => Buffer.from(s, 'utf8');

/** Aguarda `ms` milissegundos. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Diretório temporário isolado para testes em disco. */
const makeTmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cache-test-'));

// ── Suite: modo memory ────────────────────────────────────────────────────────

describe('CacheService — modo memory', () => {

  it('set/get retorna o buffer original', () => {
    const cache = new CacheService({ mode: 'memory', ttl: 5000 });
    const data  = buf('barberflow-cache-test');
    cache.set('key1', data);
    const result = cache.get('key1');
    assert.ok(Buffer.isBuffer(result), 'deve retornar um Buffer');
    assert.deepEqual(result, data, 'buffer deve ser igual ao armazenado');
  });

  it('has() retorna true para chave presente', () => {
    const cache = new CacheService({ mode: 'memory', ttl: 5000 });
    cache.set('k', buf('v'));
    assert.equal(cache.has('k'), true);
  });

  it('has() retorna false para chave ausente', () => {
    const cache = new CacheService({ mode: 'memory', ttl: 5000 });
    assert.equal(cache.has('nao-existe'), false);
  });

  it('arquivo em cache → recuperação mais rápida que fetch fresco', async () => {
    const cache       = new CacheService({ mode: 'memory', ttl: 5000 });
    const FETCH_DELAY = 60;
    const fetchFn     = () => sleep(FETCH_DELAY).then(() => buf('payload'));

    const t0 = Date.now();
    await cache.getOrFetch('recurso', fetchFn);
    const tempoFetch = Date.now() - t0;

    const t1 = Date.now();
    await cache.getOrFetch('recurso', fetchFn);
    const tempoCache = Date.now() - t1;

    assert.ok(
      tempoCache < tempoFetch,
      `Cache (${tempoCache}ms) deve ser mais rápido que fetch (${tempoFetch}ms)`,
    );
  });

  it('cache expirado → get retorna null', async () => {
    const cache = new CacheService({ mode: 'memory', ttl: 80 });
    cache.set('expirando', buf('dados'));
    assert.notEqual(cache.get('expirando'), null, 'deve existir antes de expirar');
    await sleep(120);
    assert.equal(cache.get('expirando'), null, 'deve ser null após expirar');
  });

  it('cache expirado → has() retorna false', async () => {
    const cache = new CacheService({ mode: 'memory', ttl: 80 });
    cache.set('expirando-has', buf('check'));
    assert.equal(cache.has('expirando-has'), true);
    await sleep(120);
    assert.equal(cache.has('expirando-has'), false);
  });

  it('chamadas concorrentes → fetchFn executada apenas uma vez', async () => {
    const cache = new CacheService({ mode: 'memory', ttl: 5000 });
    let fetchCount = 0;

    const fetchFn = async () => {
      fetchCount++;
      await sleep(40);
      return buf('payload-unico');
    };

    const resultados = await Promise.all([
      cache.getOrFetch('recurso-unico', fetchFn),
      cache.getOrFetch('recurso-unico', fetchFn),
      cache.getOrFetch('recurso-unico', fetchFn),
      cache.getOrFetch('recurso-unico', fetchFn),
      cache.getOrFetch('recurso-unico', fetchFn),
    ]);

    assert.equal(fetchCount, 1, 'fetchFn deve ser invocada apenas uma vez');
    for (const r of resultados) {
      assert.deepEqual(r, buf('payload-unico'));
    }
  });

  it('delete() remove a entrada', () => {
    const cache = new CacheService({ mode: 'memory', ttl: 5000 });
    cache.set('del-me', buf('x'));
    assert.equal(cache.has('del-me'), true);
    cache.delete('del-me');
    assert.equal(cache.get('del-me'), null);
  });

  it('clear() esvazia todo o cache', () => {
    const cache = new CacheService({ mode: 'memory', ttl: 5000 });
    cache.set('a', buf('1'));
    cache.set('b', buf('2'));
    cache.clear();
    assert.equal(cache.get('a'), null);
    assert.equal(cache.get('b'), null);
  });

  it('getOrFetch propaga erro do fetchFn', async () => {
    const cache   = new CacheService({ mode: 'memory', ttl: 5000 });
    const fetchFn = async () => { throw new Error('fetch falhou'); };

    await assert.rejects(
      () => cache.getOrFetch('erro-key', fetchFn),
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'fetch falhou');
        return true;
      },
    );
    assert.equal(cache.get('erro-key'), null, 'chave com erro nao deve ser cacheada');
  });
});

// ── Suite: modo disk ──────────────────────────────────────────────────────────

describe('CacheService — modo disk', () => {

  it('set/get persiste e le corretamente do disco', () => {
    const tmpDir = makeTmpDir();
    try {
      const cache = new CacheService({ mode: 'disk', ttl: 5000, dir: tmpDir });
      const data  = buf('disk-payload');
      cache.set('file-key', data);
      const result = cache.get('file-key');
      assert.ok(Buffer.isBuffer(result), 'deve retornar um Buffer');
      assert.deepEqual(result, data, 'conteudo deve ser identico ao original');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cache expirado em disco → get retorna null e arquivos sao removidos', async () => {
    const tmpDir = makeTmpDir();
    try {
      const cache = new CacheService({ mode: 'disk', ttl: 80, dir: tmpDir });
      cache.set('expira-disk', buf('bye'));
      assert.notEqual(cache.get('expira-disk'), null, 'deve existir antes de expirar');
      await sleep(120);
      assert.equal(cache.get('expira-disk'), null, 'deve ser null apos TTL');
      const arquivos = fs.readdirSync(tmpDir);
      assert.equal(arquivos.length, 0, 'arquivos expirados devem ser removidos do disco');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('chamadas concorrentes em disk → fetchFn executada apenas uma vez', async () => {
    const tmpDir = makeTmpDir();
    try {
      const cache = new CacheService({ mode: 'disk', ttl: 5000, dir: tmpDir });
      let fetchCount = 0;
      const fetchFn  = async () => {
        fetchCount++;
        await sleep(40);
        return buf('disk-val');
      };

      const resultados = await Promise.all([
        cache.getOrFetch('disk-dedup', fetchFn),
        cache.getOrFetch('disk-dedup', fetchFn),
        cache.getOrFetch('disk-dedup', fetchFn),
      ]);

      assert.equal(fetchCount, 1, 'fetchFn deve ser invocada apenas uma vez');
      for (const r of resultados) {
        assert.deepEqual(r, buf('disk-val'));
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('clear() remove todos os arquivos do diretorio em disco', () => {
    const tmpDir = makeTmpDir();
    try {
      const cache = new CacheService({ mode: 'disk', ttl: 5000, dir: tmpDir });
      cache.set('x', buf('1'));
      cache.set('y', buf('2'));
      cache.clear();
      const arquivos = fs.readdirSync(tmpDir).filter(
        (f) => f.endsWith('.data') || f.endsWith('.meta'),
      );
      assert.equal(arquivos.length, 0, 'nenhum arquivo deve restar apos clear()');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('delete() remove os arquivos .data e .meta do disco', () => {
    const tmpDir = makeTmpDir();
    try {
      const cache = new CacheService({ mode: 'disk', ttl: 5000, dir: tmpDir });
      cache.set('del-disk', buf('z'));
      assert.equal(cache.has('del-disk'), true);
      cache.delete('del-disk');
      assert.equal(cache.get('del-disk'), null);
      const arquivos = fs.readdirSync(tmpDir).filter(
        (f) => f.endsWith('.data') || f.endsWith('.meta'),
      );
      assert.equal(arquivos.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Suite: validacao de entradas ──────────────────────────────────────────────

describe('CacheService — validacao', () => {

  it('key nao-string → TypeError em get()', () => {
    const cache = new CacheService();
    assert.throws(() => cache.get(123), TypeError);
  });

  it('key vazia → TypeError em set()', () => {
    const cache = new CacheService();
    assert.throws(() => cache.set('', buf('x')), TypeError);
  });

  it('key somente espacos → TypeError em has()', () => {
    const cache = new CacheService();
    assert.throws(() => cache.has('   '), TypeError);
  });

  it('data nao-Buffer → TypeError em set()', () => {
    const cache = new CacheService();
    assert.throws(() => cache.set('k', 'nao-e-buffer'), TypeError);
  });

  it('ttl <= 0 → RangeError no construtor', () => {
    assert.throws(() => new CacheService({ ttl: 0 }),  RangeError);
    assert.throws(() => new CacheService({ ttl: -1 }), RangeError);
  });

  it('mode invalido → TypeError no construtor', () => {
    assert.throws(() => new CacheService({ mode: 'redis' }), TypeError);
  });

  it('fetchFn nao-funcao → TypeError em getOrFetch()', async () => {
    const cache = new CacheService();
    await assert.rejects(
      () => cache.getOrFetch('k', 'nao-e-funcao'),
      TypeError,
    );
  });
});
