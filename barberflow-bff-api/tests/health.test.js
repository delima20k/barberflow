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

suite('HealthController — GET /api/health', () => {

  test('responde 200', async () => {
    const { status } = await get('/api/health');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true }', async () => {
    const { body } = await get('/api/health');
    assert.strictEqual(body.ok, true);
  });

  test('dados.status === "up"', async () => {
    const { body } = await get('/api/health');
    assert.strictEqual(body.dados?.status, 'up');
  });

  test('dados.version é string', async () => {
    const { body } = await get('/api/health');
    assert.ok(typeof body.dados?.version === 'string', 'version deve ser string');
  });

  test('dados.env é string', async () => {
    const { body } = await get('/api/health');
    assert.ok(typeof body.dados?.env === 'string', 'env deve ser string');
  });

  test('dados.timestamp é ISO 8601 válido', async () => {
    const { body } = await get('/api/health');
    const ts = body.dados?.timestamp;
    assert.ok(ts && !isNaN(Date.parse(ts)), 'timestamp deve ser ISO válido');
  });

});

suite('HealthController — GET /api/v1/health', () => {

  test('responde 200 no path v1', async () => {
    const { status } = await get('/api/v1/health');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true } no path v1', async () => {
    const { body } = await get('/api/v1/health');
    assert.strictEqual(body.ok, true);
  });

  test('dados.status === "up" no path v1', async () => {
    const { body } = await get('/api/v1/health');
    assert.strictEqual(body.dados?.status, 'up');
  });

});
