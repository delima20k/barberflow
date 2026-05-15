'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Configura env antes de importar o app ────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const criarApp = require('../app');

let server;
let port;

before(async () => {
  const app = criarApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve); // porta aleatória do OS
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ── Helper HTTP ───────────────────────────────────────────────────
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

suite('ClienteBff — GET /api/v1/cliente/health', () => {

  test('responde 200', async () => {
    const { status } = await get('/api/v1/cliente/health');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true }', async () => {
    const { body } = await get('/api/v1/cliente/health');
    assert.strictEqual(body.ok, true);
  });

  test('dados.status === "up"', async () => {
    const { body } = await get('/api/v1/cliente/health');
    assert.strictEqual(body.dados?.status, 'up');
  });

  test('dados.service === "barberflow-client-bff"', async () => {
    const { body } = await get('/api/v1/cliente/health');
    assert.strictEqual(body.dados?.service, 'barberflow-client-bff');
  });

  test('nao exige autenticacao (sem header Authorization)', async () => {
    // Rota publica: deve responder 200 sem nenhum token
    const { status } = await get('/api/v1/cliente/health');
    assert.notStrictEqual(status, 401);
    assert.notStrictEqual(status, 403);
  });

});
