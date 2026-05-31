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
process.env.SUPABASE_JWT_SECRET       = 'test-supabase-jwt-secret-for-testing-only-32chars';

const TEST_USER_ID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';

// ── Stub do SupabaseClient — deve vir ANTES do require('../app') ──
const SupabaseClient = require('../utils/SupabaseClient');

const mockShopData = {
  id:                   '00000000-0000-4000-8000-000000000010',
  owner_id:             TEST_USER_ID,
  is_active:            true,
  monthly_plan_price:   50,
  monthly_plan_message: 'Mensalidade padrão',
};

const criarQB = (returnData) => {
  const q = {
    select:      () => q,
    update:      () => q,
    upsert:      () => q,
    eq:          () => q,
    neq:         () => q,
    order:       () => q,
    limit:       () => Promise.resolve({ data: [], error: null }),
    single:      () => Promise.resolve({ data: returnData, error: null }),
    maybeSingle: () => Promise.resolve({ data: returnData, error: null }),
  };
  q.then = (resolve) => resolve({ data: returnData, error: null });
  return q;
};

const mockDb = {
  from: () => criarQB(mockShopData),
  rpc:  () => Promise.resolve({ data: [], error: null }),
};

SupabaseClient.getInstance = () => mockDb;

const criarApp = require('../app');

let server;
let port;

const TOKEN_VALIDO = jwt.sign(
  { sub: TEST_USER_ID, email: 'test@barberflow.app' },
  process.env.SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);

before(async () => {
  const app = criarApp(mockDb);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

// ── HTTP helper ───────────────────────────────────────────────────

function patchMensalidade(body, { token = TOKEN_VALIDO } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: '127.0.0.1',
      port,
      path:     '/api/v1/barbearias/minha/mensalidade',
      method:   'PATCH',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    r.write(bodyStr);
    r.end();
  });
}

// ── Testes ────────────────────────────────────────────────────────

suite('BarbeariaController — PATCH /api/v1/barbearias/minha/mensalidade', () => {

  test('401 sem token de autenticação', async () => {
    const { status, body } = await patchMensalidade(
      { monthly_plan_price: 50, monthly_plan_message: 'teste' },
      { token: null },
    );
    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });

  test('401 com token inválido', async () => {
    const { status, body } = await patchMensalidade(
      { monthly_plan_price: 50, monthly_plan_message: 'teste' },
      { token: 'token-invalido' },
    );
    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });

  test('400 com preço negativo', async () => {
    const { status, body } = await patchMensalidade({ monthly_plan_price: -10 });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com preço não numérico', async () => {
    const { status, body } = await patchMensalidade({ monthly_plan_price: 'abc' });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com mensagem maior que 500 caracteres', async () => {
    const { status, body } = await patchMensalidade({
      monthly_plan_price:   50,
      monthly_plan_message: 'x'.repeat(501),
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('200 com preço e mensagem válidos', async () => {
    const { status, body } = await patchMensalidade({
      monthly_plan_price:   50,
      monthly_plan_message: 'Mensalidade padrão',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('200 com reset (preço e mensagem nulos)', async () => {
    const { status, body } = await patchMensalidade({
      monthly_plan_price:   null,
      monthly_plan_message: null,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });
});
