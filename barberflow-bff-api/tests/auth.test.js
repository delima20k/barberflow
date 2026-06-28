'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');

// ── Configura env antes de importar o app ────────────────────────
// 'test' desativa o rate limiter de /api/auth (skip em APP_ENV==='test') e o
// patchProcessEnv do R2ConfigService no startup — sem isso os testes batem 429.
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';

const TEST_USER_ID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';

const PERFIL_MOCK = {
  id:          TEST_USER_ID,
  full_name:   'Test User',
  role:        'client',
  avatar_path: null,
  phone:       null,
  pro_type:    null,
  updated_at:  new Date().toISOString(),
};

const AUTH_RESP_OK = {
  access_token:  'test.access.token',
  refresh_token: 'test-refresh-token',
  expires_at:    9_999_999_999,
  user: { id: TEST_USER_ID, email: 'test@barberflow.app' },
};

// ── Stub SupabaseClient (queries de perfil em /api/auth/me) ──────
const SupabaseClient = require('../utils/SupabaseClient');
{
  const criarQB = (tabela) => {
    if (tabela === 'profiles') {
      const q = { select: () => q, eq: () => q };
      q.single = () => Promise.resolve({ data: PERFIL_MOCK, error: null });
      return q;
    }
    const q = { select: () => q, eq: () => q };
    q.single = () => Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return q;
  };
  SupabaseClient.getInstance = () => ({ from: criarQB });
}

// ── Stub global.fetch (Supabase Auth REST API) ───────────────────
global.fetch = async (url, options) => {
  const body = (() => {
    try { return JSON.parse(options?.body ?? '{}'); } catch { return {}; }
  })();

  if (url.includes('/auth/v1/token') && url.includes('grant_type=password')) {
    if (body.email === 'test@barberflow.app' && body.password === 'senha123') {
      return { ok: true, status: 200, json: async () => AUTH_RESP_OK };
    }
    return { ok: false, status: 400, json: async () => ({ error_description: 'Invalid login credentials' }) };
  }

  if (url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')) {
    if (body.refresh_token === 'valid-refresh') {
      return { ok: true, status: 200, json: async () => AUTH_RESP_OK };
    }
    return { ok: false, status: 400, json: async () => ({ error_description: 'Invalid refresh token' }) };
  }

  if (url.includes('/auth/v1/logout')) {
    return { ok: true, status: 204, json: async () => ({}) };
  }

  return { ok: false, status: 404, json: async () => ({}) };
};

const criarApp = require('../app');

let server;
let port;

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
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

const post = (path, body, hdrs) => criarReq('POST', path, body, hdrs);
const get  = (path, hdrs)       => criarReq('GET',  path, null, hdrs);

// ── POST /api/auth/login ──────────────────────────────────────────

suite('AuthController — POST /api/auth/login', () => {

  test('retorna 400 quando email ausente', async () => {
    const { status } = await post('/api/auth/login', { password: 'senha123' });
    assert.strictEqual(status, 400);
  });

  test('retorna 400 quando senha ausente', async () => {
    const { status } = await post('/api/auth/login', { email: 'test@barberflow.app' });
    assert.strictEqual(status, 400);
  });

  test('retorna 400 com email inválido', async () => {
    const { status } = await post('/api/auth/login', { email: 'nao-eh-email', password: 'senha123' });
    assert.strictEqual(status, 400);
  });

  test('retorna 200 com credenciais válidas', async () => {
    const { status, body } = await post('/api/auth/login', {
      email: 'test@barberflow.app', password: 'senha123',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna access_token, refresh_token e expires_at', async () => {
    const { body } = await post('/api/auth/login', {
      email: 'test@barberflow.app', password: 'senha123',
    });
    assert.ok(body.dados?.access_token,  'access_token ausente');
    assert.ok(body.dados?.refresh_token, 'refresh_token ausente');
    assert.ok(body.dados?.expires_at,    'expires_at ausente');
  });

  test('retorna user com id e email', async () => {
    const { body } = await post('/api/auth/login', {
      email: 'test@barberflow.app', password: 'senha123',
    });
    assert.ok(body.dados?.user?.id,    'user.id ausente');
    assert.ok(body.dados?.user?.email, 'user.email ausente');
  });

  test('retorna 401 com credenciais inválidas', async () => {
    const { status } = await post('/api/auth/login', {
      email: 'test@barberflow.app', password: 'senha-errada',
    });
    assert.strictEqual(status, 401);
  });

});

// ── POST /api/auth/refresh ────────────────────────────────────────

suite('AuthController — POST /api/auth/refresh', () => {

  test('retorna 400 quando refresh_token ausente', async () => {
    const { status } = await post('/api/auth/refresh', {});
    assert.strictEqual(status, 400);
  });

  test('retorna 200 com refresh_token válido', async () => {
    const { status, body } = await post('/api/auth/refresh', { refresh_token: 'valid-refresh' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna access_token renovado', async () => {
    const { body } = await post('/api/auth/refresh', { refresh_token: 'valid-refresh' });
    assert.ok(body.dados?.access_token, 'access_token ausente');
  });

  test('retorna 401 com refresh_token inválido', async () => {
    const { status } = await post('/api/auth/refresh', { refresh_token: 'refresh-invalido' });
    assert.strictEqual(status, 401);
  });

});

// ── POST /api/auth/logout ─────────────────────────────────────────

suite('AuthController — POST /api/auth/logout', () => {

  test('retorna 401 sem token Authorization', async () => {
    const { status } = await post('/api/auth/logout', {});
    assert.strictEqual(status, 401);
  });

  test('retorna 200 com token válido', async () => {
    const { status, body } = await post(
      '/api/auth/logout', {},
      { Authorization: `Bearer ${TOKEN_VALIDO}` },
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

});

// ── GET /api/auth/me ──────────────────────────────────────────────

suite('AuthController — GET /api/auth/me', () => {

  test('retorna 401 sem token Authorization', async () => {
    const { status } = await get('/api/auth/me');
    assert.strictEqual(status, 401);
  });

  test('retorna 401 com token malformado', async () => {
    const { status } = await get('/api/auth/me', { Authorization: 'Bearer token-invalido' });
    assert.strictEqual(status, 401);
  });

  test('retorna 200 com token válido', async () => {
    const { status, body } = await get(
      '/api/auth/me',
      { Authorization: `Bearer ${TOKEN_VALIDO}` },
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna user.id e perfil.full_name', async () => {
    const { body } = await get(
      '/api/auth/me',
      { Authorization: `Bearer ${TOKEN_VALIDO}` },
    );
    assert.strictEqual(body.dados?.user?.id,          TEST_USER_ID);
    assert.strictEqual(body.dados?.perfil?.full_name, 'Test User');
  });

});
