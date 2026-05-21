'use strict';

// =============================================================
// cors.test.js — Testes do middleware CORS da BFF BarberFlow.
//
// Cobre:
//   - Origens de produção (.shop) — GET e OPTIONS preflight
//   - Compatibilidade com origens antigas (.vercel.app)
//   - Origens bloqueadas (sem ACAO header)
//   - Integração via servidor Express real (porta efêmera)
//
// APP_ENV=production deve ser setado ANTES de importar qualquer
// módulo, pois config/index.js é resolvido no momento do require.
// =============================================================

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Configura env antes de qualquer require ──────────────────────
process.env.APP_ENV                   = 'production';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-supabase-jwt-secret-for-testing-only-32chars';

const { criarMocks } = require('./_helpers');
const CorsMiddleware  = require('../middlewares/cors');
const criarApp        = require('../app');

// ─── Suite 1: origens de produção (.shop) — unit ─────────────────

suite('CorsMiddleware — origens de produção (.shop)', () => {

  const ORIGENS_PRODUCAO = [
    'https://app.berberflow.shop',
    'https://pro.berberflow.shop',
  ];

  for (const origin of ORIGENS_PRODUCAO) {

    test(`GET de "${origin}" recebe Access-Control-Allow-Origin`, () => {
      const { req, res, next, captured } = criarMocks({
        headers: { origin },
        method:  'GET',
      });

      CorsMiddleware.handle(req, res, next);

      assert.strictEqual(
        captured.headers['Access-Control-Allow-Origin'],
        origin,
        `"${origin}" deve receber ACAO header`,
      );
      assert.strictEqual(captured.headers['Access-Control-Allow-Credentials'], 'true');
      assert.strictEqual(captured.headers['Vary'], 'Origin');
      assert.strictEqual(next.calls.length, 1, 'next() deve ser chamado após GET permitido');
    });

    test(`OPTIONS de "${origin}" retorna 200 com headers preflight completos`, () => {
      const { req, res, next, captured } = criarMocks({
        headers: { origin },
        method:  'OPTIONS',
      });

      CorsMiddleware.handle(req, res, next);

      assert.strictEqual(captured.status, 200, 'preflight deve responder 200');
      assert.strictEqual(captured.headers['Access-Control-Allow-Origin'], origin);
      assert.strictEqual(captured.headers['Access-Control-Allow-Credentials'], 'true');
      assert.ok(
        captured.headers['Access-Control-Allow-Methods']?.includes('PATCH'),
        'PATCH deve estar nos métodos permitidos',
      );
      assert.ok(
        captured.headers['Access-Control-Allow-Methods']?.includes('OPTIONS'),
        'OPTIONS deve estar nos métodos permitidos',
      );
      assert.ok(
        captured.headers['Access-Control-Allow-Headers']?.includes('Authorization'),
        'Authorization deve estar nos headers permitidos',
      );
      assert.ok(
        captured.headers['Access-Control-Allow-Headers']?.includes('Content-Type'),
        'Content-Type deve estar nos headers permitidos',
      );
      assert.strictEqual(
        captured.headers['Access-Control-Max-Age'],
        '86400',
        'Max-Age deve ser 86400 (24h)',
      );
      assert.strictEqual(next.calls.length, 0, 'next() NÃO deve ser chamado após OPTIONS');
    });
  }
});

// ─── Suite 2: compatibilidade com origens antigas ────────────────

suite('CorsMiddleware — compatibilidade origens antigas (additive)', () => {

  const ORIGENS_ANTIGAS = [
    'https://barberflow-pro-one.vercel.app',
    'https://barberflow-profissional.vercel.app',
    'https://barberflow-cliente.vercel.app',
    'https://barberflow.app',
    'https://www.barberflow.app',
  ];

  for (const origin of ORIGENS_ANTIGAS) {
    test(`"${origin}" ainda é permitida`, () => {
      const { req, res, next, captured } = criarMocks({
        headers: { origin },
        method:  'GET',
      });

      CorsMiddleware.handle(req, res, next);

      assert.strictEqual(
        captured.headers['Access-Control-Allow-Origin'],
        origin,
        `"${origin}" deve continuar permitida (additive)`,
      );
    });
  }

  test('preview *.vercel.app genérica é bloqueada em produção (segurança)', () => {
    // Em produção, apenas origens explícitas são aceitas.
    // O wildcard *.vercel.app é restrito a ambientes não-produção.
    const origin = 'https://barberflow-pro-one-abc123-delima20ks-projects.vercel.app';
    const { req, res, next, captured } = criarMocks({
      headers: { origin },
      method:  'GET',
    });

    CorsMiddleware.handle(req, res, next);

    assert.strictEqual(
      captured.headers['Access-Control-Allow-Origin'],
      undefined,
      'wildcard *.vercel.app não deve ser permitida em produção',
    );
  });
});

// ─── Suite 3: origens bloqueadas ─────────────────────────────────

suite('CorsMiddleware — origens bloqueadas', () => {

  const BLOQUEADAS = [
    'https://atacante.com',
    'https://evil-barberflow.shop',
    'https://app.berberflow.shop.evil.com',
    'https://notberberflow.shop',
  ];

  for (const origin of BLOQUEADAS) {
    test(`"${origin}" não recebe Access-Control-Allow-Origin`, () => {
      const { req, res, next, captured } = criarMocks({
        headers: { origin },
        method:  'GET',
      });

      CorsMiddleware.handle(req, res, next);

      assert.ok(
        !captured.headers['Access-Control-Allow-Origin'],
        `"${origin}" não deve receber ACAO header`,
      );
      assert.strictEqual(
        captured.headers['Vary'],
        'Origin',
        'Vary: Origin deve estar presente mesmo para origem bloqueada',
      );
    });
  }

  test('sem origin: next() é chamado sem ACAO header', () => {
    const { req, res, next, captured } = criarMocks({ method: 'GET' });

    CorsMiddleware.handle(req, res, next);

    assert.ok(!captured.headers['Access-Control-Allow-Origin']);
    assert.strictEqual(
      captured.headers['Vary'],
      'Origin',
      'Vary: Origin deve estar presente mesmo sem origin',
    );
    assert.strictEqual(next.calls.length, 1);
  });
});

// ─── Suite 4: integração via servidor Express real ───────────────

suite('CorsMiddleware — integração (servidor real, config produção)', () => {

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

  function request(method, path, opts = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: opts.headers ?? {},
        },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode, headers: res.headers });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  test('OPTIONS /api/health de app.berberflow.shop → 200 com ACAO', async () => {
    const { status, headers } = await request('OPTIONS', '/api/v1/health', {
      headers: {
        'origin':                          'https://app.berberflow.shop',
        'access-control-request-method':   'GET',
        'access-control-request-headers':  'Content-Type',
      },
    });

    assert.strictEqual(status, 200);
    assert.strictEqual(
      headers['access-control-allow-origin'],
      'https://app.berberflow.shop',
    );
    assert.ok(headers['access-control-allow-methods']?.includes('PATCH'));
    assert.ok(headers['access-control-allow-headers']?.includes('Authorization'));
  });

  test('OPTIONS /api/health de pro.berberflow.shop → 200 com ACAO', async () => {
    const { status, headers } = await request('OPTIONS', '/api/v1/health', {
      headers: {
        'origin':                          'https://pro.berberflow.shop',
        'access-control-request-method':   'PATCH',
        'access-control-request-headers':  'Authorization',
      },
    });

    assert.strictEqual(status, 200);
    assert.strictEqual(
      headers['access-control-allow-origin'],
      'https://pro.berberflow.shop',
    );
    assert.ok(headers['access-control-allow-headers']?.includes('Authorization'));
    assert.strictEqual(headers['access-control-max-age'], '86400');
  });

  test('GET /api/health de app.berberflow.shop → ACAO header presente', async () => {
    const { headers } = await request('GET', '/api/v1/health', {
      headers: { 'origin': 'https://app.berberflow.shop' },
    });

    assert.strictEqual(
      headers['access-control-allow-origin'],
      'https://app.berberflow.shop',
    );
    assert.strictEqual(headers['access-control-allow-credentials'], 'true');
  });

  test('GET /api/health de origem bloqueada → sem ACAO header', async () => {
    const { headers } = await request('GET', '/api/v1/health', {
      headers: { 'origin': 'https://atacante.com' },
    });

    assert.ok(
      !headers['access-control-allow-origin'],
      'origem bloqueada não deve receber ACAO header',
    );
  });
});
