'use strict';
/**
 * tests/offline-sync-queue.test.js
 *
 * Testa OfflineSyncQueue: enqueue, dequeue, concluir, limparExpirados.
 *
 * Cenários cobertos:
 *   suportado()       — false quando indexedDB ausente, true quando presente
 *   enqueue()         — persiste entrada no IDB e chama sync.register
 *   enqueue()         — noop quando indexedDB não suportado
 *   dequeue()         — retorna entradas filtradas por tag
 *   dequeue()         — retorna [] quando indexedDB não suportado
 *   concluir()        — remove entrada do IDB
 *   limparExpirados() — remove entradas com createdAt abaixo do threshold
 *   limparExpirados() — preserva entradas recentes
 *   limparExpirados() — retorna 0 quando indexedDB não suportado
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm                          = require('node:vm');
const { fn, carregar }            = require('./_helpers.js');

// ─── Helpers de IDB mock ─────────────────────────────────────────────────────

/**
 * Cria um mock completo de IndexedDB em memória.
 * Suporta: open, add, delete, index.getAll, openCursor.
 */
function criarIdbMock() {
  let nextId  = 1;
  const rows  = new Map(); // id (number) → entry object

  const storeMock = {
    createIndex: fn(),

    add(entry) {
      const id   = nextId++;
      const saved = { ...entry, id };
      rows.set(id, saved);
      const req = { result: id };
      Promise.resolve().then(() => req.onsuccess?.({ target: req }));
      return req;
    },

    delete(id) {
      rows.delete(id);
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.({ target: req }));
      return req;
    },

    index(/* name */) {
      return {
        getAll(tag) {
          const result = [...rows.values()].filter(e => e.tag === tag);
          const req    = { result };
          Promise.resolve().then(() => req.onsuccess?.({ target: req }));
          return req;
        },
      };
    },

    openCursor() {
      const entries = [...rows.values()];
      let   idx     = 0;
      const req     = {};

      function avançar() {
        if (idx >= entries.length) {
          req.onsuccess?.({ target: { result: null } });
          return;
        }
        const entry  = entries[idx++];
        const cursor = {
          value:    entry,
          delete()  { rows.delete(entry.id); },
          continue(){ Promise.resolve().then(avançar); },
        };
        req.onsuccess?.({ target: { result: cursor } });
      }

      Promise.resolve().then(avançar);
      return req;
    },
  };

  const txMock = { objectStore: () => storeMock };

  const dbMock = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => storeMock,
    transaction:       () => txMock,
  };

  const idbMock = {
    open(/* name, version */) {
      const req = { result: dbMock };
      Promise.resolve()
        .then(() => req.onupgradeneeded?.({ target: req }))
        .then(() => req.onsuccess?.({ target: req }));
      return req;
    },
  };

  return { idbMock, rows };
}

// ─── Factory do sandbox VM ────────────────────────────────────────────────────

function criarSandbox({ suportaIdb = true, syncRegisterFail = false } = {}) {
  const { idbMock, rows } = criarIdbMock();

  // sw.ready com sync.register mock
  const syncRegister = fn().mockResolvedValue(undefined);
  if (syncRegisterFail) syncRegister.mockRejectedValue(new Error('sync indisponível'));

  const swReadyMock = Promise.resolve({
    sync: { register: syncRegister },
  });

  const navigatorMock = {
    serviceWorker: {
      ready: swReadyMock,
    },
  };

  const ctx = vm.createContext({
    // IDB
    indexedDB:    suportaIdb ? idbMock : undefined,
    // navigator
    navigator:    navigatorMock,
    // console
    console,
    // Globals do host — evita incompatibilidade de prototype no deepStrictEqual
    Promise,
    Array,
    Object,
  });

  carregar(ctx, 'shared/js/OfflineSyncQueue.js');

  return { ctx, rows, syncRegister };
}

// ─── Testes ──────────────────────────────────────────────────────────────────

suite('OfflineSyncQueue — suportado()', () => {
  test('retorna true quando indexedDB disponível', () => {
    const { ctx } = criarSandbox({ suportaIdb: true });
    assert.equal(ctx.OfflineSyncQueue.suportado(), true);
  });

  test('retorna false quando indexedDB ausente', () => {
    const { ctx } = criarSandbox({ suportaIdb: false });
    assert.equal(ctx.OfflineSyncQueue.suportado(), false);
  });
});

suite('OfflineSyncQueue — enqueue()', () => {
  test('persiste entrada no IDB e chama sync.register', async () => {
    const { ctx, rows, syncRegister } = criarSandbox();

    await ctx.OfflineSyncQueue.enqueue({
      tag:    'bf-sync-queue',
      url:    '/api/mensagens',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:   '{"texto":"olá"}',
    });

    assert.equal(rows.size, 1);
    const [entry] = rows.values();
    assert.equal(entry.tag,    'bf-sync-queue');
    assert.equal(entry.url,    '/api/mensagens');
    assert.equal(entry.method, 'POST');
    assert.equal(entry.retries, 0);
    assert.ok(entry.createdAt > 0);

    // sync.register deve ter sido chamado com a tag
    assert.equal(syncRegister.calls.length, 1);
    assert.equal(syncRegister.calls[0][0], 'bf-sync-queue');
  });

  test('noop quando indexedDB não suportado', async () => {
    const { ctx, rows, syncRegister } = criarSandbox({ suportaIdb: false });

    await ctx.OfflineSyncQueue.enqueue({
      tag: 'bf-sync-queue',
      url: '/api/mensagens',
    });

    assert.equal(rows.size, 0);
    assert.equal(syncRegister.calls.length, 0);
  });

  test('não lança quando sync.register falha (graceful)', async () => {
    const { ctx } = criarSandbox({ syncRegisterFail: true });

    await assert.doesNotReject(() =>
      ctx.OfflineSyncQueue.enqueue({
        tag: 'bf-sync-queue',
        url: '/api/mensagens',
      }),
    );
  });
});

suite('OfflineSyncQueue — dequeue()', () => {
  test('retorna entradas filtradas por tag', async () => {
    const { ctx } = criarSandbox();

    await ctx.OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/a' });
    await ctx.OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/b' });
    await ctx.OfflineSyncQueue.enqueue({ tag: 'outra-tag',     url: '/api/c' });

    const result = await ctx.OfflineSyncQueue.dequeue('bf-sync-queue');

    assert.equal(result.length, 2);
    assert.equal(result[0].url, '/api/a');
    assert.equal(result[1].url, '/api/b');
  });

  test('retorna [] quando não há entradas para a tag', async () => {
    const { ctx } = criarSandbox();

    const result = await ctx.OfflineSyncQueue.dequeue('inexistente');
    assert.deepEqual(result, []);
  });

  test('retorna [] quando indexedDB não suportado', async () => {
    const { ctx } = criarSandbox({ suportaIdb: false });

    const result = await ctx.OfflineSyncQueue.dequeue('bf-sync-queue');
    assert.equal(result.length, 0);
  });
});

suite('OfflineSyncQueue — concluir()', () => {
  test('remove a entrada do IDB pelo id', async () => {
    const { ctx, rows } = criarSandbox();

    await ctx.OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/a' });
    assert.equal(rows.size, 1);

    const [entry] = rows.values();
    await ctx.OfflineSyncQueue.concluir(entry.id);

    assert.equal(rows.size, 0);
  });

  test('noop quando indexedDB não suportado', async () => {
    const { ctx } = criarSandbox({ suportaIdb: false });

    await assert.doesNotReject(() => ctx.OfflineSyncQueue.concluir(1));
  });
});

suite('OfflineSyncQueue — limparExpirados()', () => {
  test('remove entradas mais antigas que maxAgeMs', async () => {
    const { ctx, rows } = criarSandbox();

    // Enfileira 2 entradas com datas antigas
    await ctx.OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/old1' });
    await ctx.OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/old2' });

    // Retrodata as entradas
    for (const [id, entry] of rows) {
      rows.set(id, { ...entry, createdAt: Date.now() - 49 * 60 * 60 * 1000 }); // 49h atrás
    }

    const removidos = await ctx.OfflineSyncQueue.limparExpirados();
    assert.equal(removidos, 2);
    assert.equal(rows.size,  0);
  });

  test('preserva entradas dentro do TTL', async () => {
    const { ctx, rows } = criarSandbox();

    await ctx.OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/recente' });

    const removidos = await ctx.OfflineSyncQueue.limparExpirados();
    assert.equal(removidos, 0);
    assert.equal(rows.size,  1);
  });

  test('retorna 0 quando indexedDB não suportado', async () => {
    const { ctx } = criarSandbox({ suportaIdb: false });

    const removidos = await ctx.OfflineSyncQueue.limparExpirados();
    assert.equal(removidos, 0);
  });
});
