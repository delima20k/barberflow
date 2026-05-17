'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Configura env antes de importar o app ────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

// ── Stub do SupabaseClient — deve vir ANTES do require('../app') ──
// Sobrescreve getInstance para retornar um cliente falso que
// responde todas as queries com { data: [], error: null }.
// mockDb exposto no escopo de módulo para permitir override em testes de fallback.
const SupabaseClient = require('../utils/SupabaseClient');
const _qb = () => {
  const q = {
    select:  () => q,
    eq:      () => q,
    gte:     () => q,
    lte:     () => q,
    order:   () => q,
    limit:   () => Promise.resolve({ data: [], error: null }),
  };
  return q;
};
const mockDb = {
  from: _qb,
  rpc:  () => Promise.resolve({ data: [], error: null }),
};
SupabaseClient.getInstance = () => mockDb;

const criarApp = require('../app');

let server;
let port;

before(async () => {
  const app = criarApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ── Helpers HTTP ─────────────────────────────────────────────────
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject);
  });
}

// ── Testes ────────────────────────────────────────────────────────

suite('BarbeariaController — GET /api/v1/barbearias (proximas)', () => {

  test('responde 200 com lat e lng válidos', async () => {
    const { status } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true } com lat e lng válidos', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array');
  });

  test('retorna total numérico', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.ok(typeof body.meta?.total === 'number', 'meta.total deve ser número');
  });

  test('400 sem lat', async () => {
    const { status, body } = await get('/api/v1/barbearias?lng=-47.88');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 sem lng', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 sem nenhuma coordenada', async () => {
    const { status, body } = await get('/api/v1/barbearias');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com lat não numérico', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=abc&lng=-47.88');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com raio fora do intervalo (>100)', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88&raio=999');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('aceita raio customizado válido', async () => {
    const { status } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88&raio=10');
    assert.strictEqual(status, 200);
  });

});

suite('BarbeariaController — GET /api/v1/barbearias/destaque', () => {

  test('responde 200', async () => {
    const { status } = await get('/api/v1/barbearias/destaque');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true }', async () => {
    const { body } = await get('/api/v1/barbearias/destaque');
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get('/api/v1/barbearias/destaque');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array');
  });

  test('aceita limit customizado', async () => {
    const { status } = await get('/api/v1/barbearias/destaque?limit=3');
    assert.strictEqual(status, 200);
  });

  test('400 com limit não numérico', async () => {
    const { status, body } = await get('/api/v1/barbearias/destaque?limit=abc');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

});

suite('BarbeariaController — GET /api/v1/barbearias/todas', () => {

  test('responde 200', async () => {
    const { status } = await get('/api/v1/barbearias/todas');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true }', async () => {
    const { body } = await get('/api/v1/barbearias/todas');
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get('/api/v1/barbearias/todas');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array');
  });

  test('aceita limit customizado', async () => {
    const { status } = await get('/api/v1/barbearias/todas?limit=10');
    assert.strictEqual(status, 200);
  });

  test('400 com limit não numérico', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas?limit=xyz');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com limit = 0 (abaixo do mínimo)', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas?limit=0');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com limit = 101 (acima do máximo)', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas?limit=101');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('200 com array vazio quando banco não tem barbearias', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.dados));
  });

});

suite('BarbeariaController — GET /api/v1/barbearias (fallback bounding-box)', () => {

  // Guarda referência original do mock de rpc para restaurar após a suíte
  let rpcOriginal;

  before(() => {
    rpcOriginal  = mockDb.rpc;
    // Simula RPC indisponível (PostGIS não instalado — PGRST202)
    mockDb.rpc = () => Promise.resolve({
      data:  null,
      error: {
        code:    'PGRST202',
        message: 'Could not find the function public.get_barbershops_nearby(lat, limit_val, lng, raio_metros) in the schema cache',
      },
    });
  });

  after(() => {
    mockDb.rpc = rpcOriginal;
  });

  test('retorna 200 mesmo quando RPC falha (fallback bounding-box ativo)', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados via fallback', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array mesmo via fallback');
  });

  test('400 com raio abaixo do mínimo permitido (< 5)', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88&raio=1');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

});
