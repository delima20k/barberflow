'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');

process.env.APP_ENV                   = 'test';
process.env.NODE_ENV                  = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';

const TEST_USER_ID = 'b2c3d4e5-f6a7-4901-bcde-f12345678901';
const DocumentCipher = require('../infrastructure/crypto/DocumentCipher');
let profileCpfCnpjEnc = null;

// ── Stub SupabaseClient ───────────────────────────────────────────
const SupabaseClient = require('../utils/SupabaseClient');
{
  const criarQB = (tabela) => {
    if (tabela === 'profiles') {
      const q = {};
      // select → eq → single (para getPerfil)
      q.select = () => q;
      q.eq     = () => q;
      q.single = () => Promise.resolve({
        data: { id: TEST_USER_ID, full_name: 'Test', role: 'professional', cpf_cnpj_enc: profileCpfCnpjEnc },
        error: null,
      });
      // update → eq (para salvarDocumento)
      q.update = () => ({ eq: () => Promise.resolve({ error: null }) });
      return q;
    }
    const q = { select: () => q, eq: () => q };
    q.single = () => Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return q;
  };
  SupabaseClient.getInstance = () => ({ from: criarQB });
}

// ── Stub fetch (Auth REST) ────────────────────────────────────────
global.fetch = async (url) => {
  if (url.includes('/auth/v1/logout')) return { ok: true, status: 204, json: async () => ({}) };
  return { ok: false, status: 404, json: async () => ({}) };
};

const criarApp = require('../app');

let server;
let port;

const TOKEN = jwt.sign(
  { sub: TEST_USER_ID, email: 'prof@test.com' },
  process.env.SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);

before(async () => {
  const app = criarApp();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

function req(method, path, body, headers = {}) {
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

const post = (path, body, hdrs) => req('POST', path, body, hdrs);
const get = (path, hdrs) => req('GET', path, null, hdrs);

suite('POST /api/v1/auth/documento', () => {

  test('retorna 401 sem token', async () => {
    const { status } = await post('/api/v1/auth/documento', { cpfCnpj: '12345678901' });
    assert.strictEqual(status, 401);
  });

  test('retorna 401 com token malformado', async () => {
    const { status } = await post(
      '/api/v1/auth/documento',
      { cpfCnpj: '12345678901' },
      { Authorization: 'Bearer token-invalido' },
    );
    assert.strictEqual(status, 401);
  });

  test('retorna 400 quando cpfCnpj ausente', async () => {
    const { status } = await post(
      '/api/v1/auth/documento',
      {},
      { Authorization: `Bearer ${TOKEN}` },
    );
    assert.strictEqual(status, 400);
  });

  test('retorna 400 quando cpfCnpj tem comprimento inválido', async () => {
    const { status } = await post(
      '/api/v1/auth/documento',
      { cpfCnpj: '123' },
      { Authorization: `Bearer ${TOKEN}` },
    );
    assert.strictEqual(status, 400);
  });

  test('retorna 200 com CPF de 11 dígitos válido', async () => {
    const { status, body } = await post(
      '/api/v1/auth/documento',
      { cpfCnpj: '12345678901' },
      { Authorization: `Bearer ${TOKEN}` },
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna 200 com CNPJ de 14 dígitos válido', async () => {
    const { status, body } = await post(
      '/api/v1/auth/documento',
      { cpfCnpj: '12345678000195' },
      { Authorization: `Bearer ${TOKEN}` },
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('aceita CPF com formatação (máscara) e normaliza', async () => {
    const { status } = await post(
      '/api/v1/auth/documento',
      { cpfCnpj: '123.456.789-01' },
      { Authorization: `Bearer ${TOKEN}` },
    );
    assert.strictEqual(status, 200);
  });

  test('aceita CNPJ com formatação e normaliza', async () => {
    const { status } = await post(
      '/api/v1/auth/documento',
      { cpfCnpj: '12.345.678/0001-95' },
      { Authorization: `Bearer ${TOKEN}` },
    );
    assert.strictEqual(status, 200);
  });

});

suite('GET /api/v1/auth/me documento seguro', () => {

  test('retorna apenas hasDocument=false quando perfil nao tem documento', async () => {
    profileCpfCnpjEnc = null;
    const { status, body } = await get(
      '/api/v1/auth/me',
      { Authorization: `Bearer ${TOKEN}` },
    );

    assert.strictEqual(status, 200);
    assert.strictEqual(body.dados.perfil.hasDocument, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(body.dados.perfil, 'cpf_cnpj'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(body.dados.perfil, 'cpf_cnpj_enc'), false);
  });

  test('retorna apenas hasDocument=true quando documento cifrado existe', async () => {
    profileCpfCnpjEnc = DocumentCipher.encrypt('12345678901');
    const { status, body } = await get(
      '/api/v1/auth/me',
      { Authorization: `Bearer ${TOKEN}` },
    );
    profileCpfCnpjEnc = null;

    assert.strictEqual(status, 200);
    assert.strictEqual(body.dados.perfil.hasDocument, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(body.dados.perfil, 'cpf_cnpj'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(body.dados.perfil, 'cpf_cnpj_enc'), false);
  });

});
