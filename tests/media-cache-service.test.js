'use strict';
/**
 * tests/media-cache-service.test.js
 *
 * Testa MediaCacheService com IndexedDB mockado via globalThis.
 * Cobre: salvar, obter, TTL expirado, temCache, limpar.
 *
 * IndexedDB mock: implementação em memória mínima que emula a API IDBDatabase/IDBObjectStore.
 */

const { suite, test, beforeEach } = require('node:test');
const assert                       = require('node:assert/strict');
const vm                           = require('node:vm');
const { fn, carregar }             = require('./_helpers.js');

// ── IndexedDB mock em memória ────────────────────────────────────────────────

function criarIndexedDBMock() {
  const stores = {};  // nome → Map<key, value>

  function criarObjectStore(storeName, data) {
    if (!stores[storeName]) stores[storeName] = new Map();
    const store = stores[storeName];

    const criarRequest = (result) => {
      const req = { result, error: null };
      setTimeout(() => req.onsuccess?.({ target: req }), 0);
      return req;
    };

    return {
      put: (value) => {
        store.set(value.mediaId, value);
        return criarRequest(value.mediaId);
      },
      get: (key) => criarRequest(store.get(key) ?? undefined),
      delete: (key) => { store.delete(key); return criarRequest(undefined); },
      openCursor: () => {
        const entries = [...store.values()];
        let idx = 0;
        const req = { result: null, error: null };
        function avançar() {
          if (idx < entries.length) {
            const value = entries[idx++];
            req.result = {
              value,
              delete: () => { store.delete(value.mediaId); },
              continue: () => setTimeout(avançar, 0),
            };
            req.onsuccess?.({ target: req });
          } else {
            req.result = null;
            req.onsuccess?.({ target: req });
          }
        }
        setTimeout(avançar, 0);
        return req;
      },
    };
  }

  const db = {
    _stores: stores,
    transaction: (storeName, _modo) => ({
      objectStore: () => criarObjectStore(storeName, stores[storeName]),
    }),
    createObjectStore: (storeName) => {
      stores[storeName] = new Map();
      return {
        createIndex: fn(),
      };
    },
  };

  const indexedDB = {
    open: (nome, versao) => {
      const req = { result: null, error: null };
      setTimeout(() => {
        req.result = db;
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      }, 0);
      return req;
    },
  };

  return { indexedDB, db };
}

// ── Sandbox para MediaCacheService ───────────────────────────────────────────

function criarSandbox() {
  const { indexedDB } = criarIndexedDBMock();

  const sb = vm.createContext({
    console,
    Error, TypeError, Promise, Map, WeakSet,
    ArrayBuffer, Uint8Array,
    Date,
    indexedDB,
    // Nota: classe usa `indexedDB` diretamente (browser global)
  });

  carregar(sb, 'shared/js/MediaCacheService.js');
  return sb;
}

// ── Utilitário para criar ArrayBuffer ───────────────────────────────────────

function criarBuffer(bytes = 64) {
  const ab = new ArrayBuffer(bytes);
  const v  = new Uint8Array(ab);
  v.fill(0xAB);
  return ab;
}

// ─────────────────────────────────────────────────────────────────────────────
suite('MediaCacheService.suportado()', () => {

  test('retorna true quando indexedDB está disponível no sandbox', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.MediaCacheService.suportado(), true);
  });

  test('retorna false quando indexedDB não está disponível', () => {
    const sb = vm.createContext({
      console, Error, TypeError, Promise, Map, WeakSet,
      ArrayBuffer, Uint8Array, Date,
      // indexedDB ausente
    });
    carregar(sb, 'shared/js/MediaCacheService.js');
    assert.strictEqual(sb.MediaCacheService.suportado(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('MediaCacheService.salvar() + obter()', () => {

  test('salva e recupera um buffer', async () => {
    const sb     = criarSandbox();
    const buffer = criarBuffer(128);

    await sb.MediaCacheService.salvar('media-1', buffer, { mimeType: 'image/webp', ttlMs: 60_000 });
    const recuperado = await sb.MediaCacheService.obter('media-1');

    assert.ok(recuperado instanceof ArrayBuffer, 'deve retornar ArrayBuffer');
    assert.strictEqual(recuperado.byteLength, 128);
  });

  test('retorna null para mediaId inexistente', async () => {
    const sb = criarSandbox();
    const r  = await sb.MediaCacheService.obter('inexistente');
    assert.strictEqual(r, null);
  });

  test('retorna null se não passar buffer ArrayBuffer', async () => {
    const sb = criarSandbox();
    // Não deve lançar, apenas ignorar
    await sb.MediaCacheService.salvar('media-x', 'string-invalida', { mimeType: 'image/webp', ttlMs: 1000 });
    const r = await sb.MediaCacheService.obter('media-x');
    assert.strictEqual(r, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('MediaCacheService — TTL', () => {

  test('entrada expirada retorna null em obter()', async () => {
    const sb     = criarSandbox();
    const buffer = criarBuffer(32);

    // TTL de 1ms — expira imediatamente
    await sb.MediaCacheService.salvar('media-exp', buffer, { mimeType: 'image/webp', ttlMs: 1 });
    await new Promise(r => setTimeout(r, 10)); // garantir que expirou

    const r = await sb.MediaCacheService.obter('media-exp');
    assert.strictEqual(r, null, 'deve retornar null para entrada expirada');
  });

  test('temCache retorna false para entrada expirada (síncrono)', async () => {
    const sb     = criarSandbox();
    const buffer = criarBuffer(32);

    await sb.MediaCacheService.salvar('media-ttl', buffer, { mimeType: 'image/webp', ttlMs: 1 });
    await new Promise(r => setTimeout(r, 10));

    assert.strictEqual(sb.MediaCacheService.temCache('media-ttl'), false);
  });

  test('temCache retorna true para entrada válida', async () => {
    const sb     = criarSandbox();
    const buffer = criarBuffer(32);

    await sb.MediaCacheService.salvar('media-ok', buffer, { mimeType: 'image/webp', ttlMs: 60_000 });

    assert.strictEqual(sb.MediaCacheService.temCache('media-ok'), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('MediaCacheService.limpar()', () => {

  test('remove entradas expiradas e retorna contagem', async () => {
    const sb      = criarSandbox();
    const buffer  = criarBuffer(32);

    // 2 entradas expiradas + 1 válida
    await sb.MediaCacheService.salvar('exp-1', buffer, { mimeType: 'image/webp', ttlMs: 1 });
    await sb.MediaCacheService.salvar('exp-2', buffer, { mimeType: 'image/webp', ttlMs: 1 });
    await sb.MediaCacheService.salvar('valid', buffer, { mimeType: 'image/webp', ttlMs: 60_000 });

    await new Promise(r => setTimeout(r, 10)); // garantir que as 2 primeiras expiraram

    const removidas = await sb.MediaCacheService.limpar();

    assert.ok(removidas >= 2, `deve remover ao menos 2 entradas expiradas, removeu ${removidas}`);

    // Entrada válida ainda deve existir
    const r = await sb.MediaCacheService.obter('valid');
    assert.ok(r instanceof ArrayBuffer, 'entrada válida não deve ser removida');
  });
});
