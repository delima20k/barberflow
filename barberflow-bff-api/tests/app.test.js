'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Configura env antes de importar o app ────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

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

// ── Helper HTTP ───────────────────────────────────────────────────
function request(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
      });
    });

    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

// ── Testes ────────────────────────────────────────────────────────

suite('App — inicialização', () => {

  test('criarApp() retorna objeto com listen', () => {
    const app = criarApp();
    assert.ok(typeof app.listen === 'function');
  });

  test('servidor aceita conexões', async () => {
    const { status } = await request('GET', '/api/health');
    assert.ok(status >= 200 && status < 600, `status HTTP esperado, recebeu: ${status}`);
  });

});

suite('App — 404 para rota não mapeada', () => {

  test('GET /api/inexistente → 404', async () => {
    const { status, body } = await request('GET', '/api/rota-que-nao-existe-xyz');
    assert.strictEqual(status, 404);
    assert.strictEqual(body.ok, false);
  });

  test('POST /api/rota-que-nao-existe → 404', async () => {
    const { status } = await request('POST', '/api/rota-que-nao-existe-xyz');
    assert.strictEqual(status, 404);
  });

});

suite('App — headers de segurança (Helmet)', () => {

  test('X-Content-Type-Options presente na resposta', async () => {
    const { headers } = await request('GET', '/api/health');
    assert.ok(
      headers['x-content-type-options'],
      'X-Content-Type-Options deve estar presente',
    );
  });

});

suite('App — CORS preflight (OPTIONS)', () => {

  test('OPTIONS de origem permitida retorna 200', async () => {
    const { status } = await request('OPTIONS', '/api/health', {
      headers: {
        'Origin':                         'http://localhost:3000',
        'Access-Control-Request-Method':  'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    assert.strictEqual(status, 200);
  });

  test('GET de origem permitida retorna Access-Control-Allow-Origin', async () => {
    const { headers } = await request('GET', '/api/health', {
      headers: { 'Origin': 'http://localhost:3000' },
    });
    assert.strictEqual(headers['access-control-allow-origin'], 'http://localhost:3000');
  });

});

// ── app.js invocado como handler HTTP pela plataforma ───────────────
// Regressão: a Vercel invocava este módulo como handler(req, res), fazendo o
// request cair no parâmetro `db` e ser injetado em todas as rotas — derrubava
// 100% das requisições com FUNCTION_INVOCATION_FAILED, inclusive o preflight
// OPTIONS (o CORS nem chegava a rodar).
suite('criarApp invocado como handler HTTP', () => {
  let srvH;
  let portH;

  before(async () => {
    await new Promise((resolve) => {
      srvH = http.createServer((req, res) => criarApp(req, res));
      srvH.listen(0, '127.0.0.1', resolve);
    });
    portH = srvH.address().port;
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      srvH.close((err) => (err ? reject(err) : resolve())),
    );
  });

  function pedir(method, path, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: portH, path, method, headers },
        (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  test('GET responde a requisição em vez de estourar TypeError', async () => {
    const { status } = await pedir('GET', '/api/v1/health');
    assert.strictEqual(status, 200);
  });

  test('preflight OPTIONS responde 200 com CORS', async () => {
    const { status, headers } = await pedir('OPTIONS', '/api/v1/health', {
      'Origin':                        'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  test('rota inexistente responde 404 (app montado por completo)', async () => {
    const { status } = await pedir('GET', '/api/v1/rota-que-nao-existe');
    assert.strictEqual(status, 404);
  });

  test('chamada normal como fábrica continua retornando um app Express', () => {
    const app = criarApp();
    assert.strictEqual(typeof app.listen, 'function');
  });
});
