'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');

// ── Configura env antes de importar o app ────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';

const TEST_USER_ID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';

const mockLocation = {
  last_lat:         -15.79,
  last_lng:         -47.88,
  last_location_at: new Date().toISOString(),
};

// ── Stub do SupabaseClient — deve vir ANTES do require('../app') ──
const SupabaseClient = require('../utils/SupabaseClient');
{
  // Retorna chainable builder que suporta select/update/eq/single e thenable.
  // - update().eq() → await → { data: null, error: null }
  // - select().eq().single() → { data: mockLocation, error: null }
  const criarQB = () => {
    const q = {
      select: () => q,
      update: () => q,
      eq:     () => q,
      single: () => Promise.resolve({ data: mockLocation, error: null }),
    };
    // Thenable: permite `await db.from().update().eq()` → { data: null, error: null }
    q.then = (resolve) => resolve({ data: null, error: null });
    return q;
  };
  SupabaseClient.getInstance = () => ({ from: () => criarQB() });
}

const criarApp = require('../app');

let server;
let port;

// JWT assinado com o secret de teste para simular usuário autenticado
const TOKEN_VALIDO = jwt.sign(
  { sub: TEST_USER_ID, email: 'test@barberflow.app' },
  process.env.SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);

before(async () => {
  const app = criarApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

// ── HTTP helpers ──────────────────────────────────────────────────

function criarReq(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN_VALIDO}` };

function patchLoc(body, comAuth = true) {
  return criarReq('PATCH', '/api/v1/clientes/localizacao', body, comAuth ? AUTH_HEADERS : {});
}

function getLoc(comAuth = true) {
  return criarReq('GET', '/api/v1/clientes/localizacao', null, comAuth ? AUTH_HEADERS : {});
}

// ═════════════════════════════════════════════════════════════════
// PATCH /api/v1/clientes/localizacao
// ═════════════════════════════════════════════════════════════════

suite('GeoController — PATCH /api/v1/clientes/localizacao', () => {

  test('salva localização e retorna 200', async () => {
    const { status, body } = await patchLoc({ lat: -15.79, lng: -47.88 });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna 401 sem token de autenticação', async () => {
    const { status, body } = await patchLoc({ lat: -15.79, lng: -47.88 }, false);
    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 401 com token inválido', async () => {
    const { status, body } = await criarReq(
      'PATCH',
      '/api/v1/clientes/localizacao',
      { lat: -15.79, lng: -47.88 },
      { Authorization: 'Bearer token.invalido.assinado' },
    );
    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 sem campo lat', async () => {
    const { status, body } = await patchLoc({ lng: -47.88 });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 sem campo lng', async () => {
    const { status, body } = await patchLoc({ lat: -15.79 });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 com body vazio', async () => {
    const { status, body } = await patchLoc({});
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 com lat não numérico', async () => {
    const { status, body } = await patchLoc({ lat: 'abc', lng: -47.88 });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 com lat fora do intervalo (> 90)', async () => {
    const { status, body } = await patchLoc({ lat: 200, lng: -47.88 });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 com lng fora do intervalo (> 180)', async () => {
    const { status, body } = await patchLoc({ lat: -15.79, lng: 200 });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });
});

// ═════════════════════════════════════════════════════════════════
// GET /api/v1/clientes/localizacao
// ═════════════════════════════════════════════════════════════════

suite('GeoController — GET /api/v1/clientes/localizacao', () => {

  test('retorna 200 com dados de localização', async () => {
    const { status, body } = await getLoc();
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna dados com lat e lng', async () => {
    const { status, body } = await getLoc();
    assert.strictEqual(status, 200);
    assert.ok(body.dados?.lat != null, 'dados.lat deve existir');
    assert.ok(body.dados?.lng != null, 'dados.lng deve existir');
  });

  test('retorna 401 sem token de autenticação', async () => {
    const { status, body } = await getLoc(false);
    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });
});
