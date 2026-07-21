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
const BaseController  = require('../controllers/BaseController');
const criarApp        = require('../app');

// ─── Suite 1: origens de produção (.shop) — unit ─────────────────

suite('CorsMiddleware — origens de produção (.shop)', () => {

  const ORIGENS_PRODUCAO = [
    'https://barberflow.live',
    'https://www.barberflow.live',
    'https://app.barberflow.live',
    'https://pro.barberflow.live',
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
      assert.ok(
        captured.headers['Cache-Control']?.includes('private') &&
        captured.headers['Cache-Control']?.includes('no-store'),
        'GET de origem permitida deve ter Cache-Control: private, no-store (impede cache CDN por URL)',
      );
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
      assert.ok(
        captured.headers['Access-Control-Allow-Headers']?.includes('X-BarberFlow-Diagnostics'),
        'X-BarberFlow-Diagnostics deve estar nos headers permitidos para diagnostico de producao',
      );
      assert.ok(
        captured.headers['Access-Control-Allow-Headers']?.includes('X-Media-Metadata'),
        'X-Media-Metadata deve estar nos headers permitidos para upload comprimido de stories',
      );
      assert.ok(
        captured.headers['Access-Control-Expose-Headers']?.includes('X-Chat-Diagnostics'),
        'X-Chat-Diagnostics deve estar exposto para leitura pelo browser',
      );
      assert.ok(
        captured.headers['Access-Control-Expose-Headers']?.includes('Server-Timing'),
        'Server-Timing deve estar exposto para leitura pelo browser',
      );
      assert.strictEqual(
        captured.headers['Access-Control-Max-Age'],
        '86400',
        'Max-Age deve ser 86400 (24h)',
      );
      assert.ok(
        captured.headers['Cache-Control']?.includes('private') &&
        captured.headers['Cache-Control']?.includes('no-store'),
        'Cache-Control deve conter private e no-store para evitar CDN cachear preflight por URL',
      );
      assert.strictEqual(next.calls.length, 0, 'next() NÃO deve ser chamado após OPTIONS');
    });
  }
});

// ─── Suite 1b: Cache-Control anti-CDN-cache ──────────────────────

suite('CorsMiddleware — Cache-Control anti-CDN-cache', () => {

  test('OPTIONS retorna Cache-Control: private, no-store', () => {
    const { req, res, next, captured } = criarMocks({
      headers: { origin: 'https://app.barberflow.live' },
      method:  'OPTIONS',
    });

    CorsMiddleware.handle(req, res, next);

    assert.ok(
      captured.headers['Cache-Control']?.includes('private'),
      'Cache-Control deve incluir private (impede cache em shared CDN)',
    );
    assert.ok(
      captured.headers['Cache-Control']?.includes('no-store'),
      'Cache-Control deve incluir no-store',
    );
  });

  test('GET de origem permitida recebe Cache-Control: private, no-store', () => {
    const { req, res, next, captured } = criarMocks({
      headers: { origin: 'https://app.barberflow.live' },
      method:  'GET',
    });

    CorsMiddleware.handle(req, res, next);

    assert.ok(
      captured.headers['Cache-Control']?.includes('private') &&
      captured.headers['Cache-Control']?.includes('no-store'),
      'GET de origem permitida deve receber Cache-Control: private, no-store',
    );
  });

  test('cachePublico preserva resposta CORS como private e bloqueia cache CDN', () => {
    const controller = new BaseController();
    const headers = new Map();
    const res = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      getHeader: (name) => headers.get(name.toLowerCase()),
    };

    res.setHeader('Access-Control-Allow-Origin', 'https://app.barberflow.live');
    controller.cachePublico(res, 30, 60);

    assert.strictEqual(
      headers.get('cache-control'),
      'private, max-age=30, stale-while-revalidate=60',
      'cache publico nao deve sobrescrever CORS com cache compartilhado',
    );
    assert.strictEqual(headers.get('cdn-cache-control'), 'no-store');
    assert.strictEqual(headers.get('surrogate-control'), 'no-store');
  });
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
    'https://app.barberflow.live.evil.com',
    'https://notbarberflow.live',
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

  test('OPTIONS /api/health de app.barberflow.live → 200 com ACAO', async () => {
    const { status, headers } = await request('OPTIONS', '/api/v1/health', {
      headers: {
        'origin':                          'https://app.barberflow.live',
        'access-control-request-method':   'GET',
        'access-control-request-headers':  'Content-Type',
      },
    });

    assert.strictEqual(status, 200);
    assert.strictEqual(
      headers['access-control-allow-origin'],
      'https://app.barberflow.live',
    );
    assert.ok(headers['access-control-allow-methods']?.includes('PATCH'));
    assert.ok(headers['access-control-allow-headers']?.includes('Authorization'));
  });

  test('OPTIONS /api/health de pro.barberflow.live → 200 com ACAO', async () => {
    const { status, headers } = await request('OPTIONS', '/api/v1/health', {
      headers: {
        'origin':                          'https://pro.barberflow.live',
        'access-control-request-method':   'PATCH',
        'access-control-request-headers':  'Authorization',
      },
    });

    assert.strictEqual(status, 200);
    assert.strictEqual(
      headers['access-control-allow-origin'],
      'https://pro.barberflow.live',
    );
    assert.ok(headers['access-control-allow-headers']?.includes('Authorization'));
    assert.strictEqual(headers['access-control-max-age'], '86400');
  });

  test('GET /api/health de app.barberflow.live → ACAO header presente', async () => {
    const { headers } = await request('GET', '/api/v1/health', {
      headers: { 'origin': 'https://app.barberflow.live' },
    });

    assert.strictEqual(
      headers['access-control-allow-origin'],
      'https://app.barberflow.live',
    );
    assert.strictEqual(headers['access-control-allow-credentials'], 'true');
    assert.ok(headers['access-control-expose-headers']?.includes('X-Chat-Diagnostics'));
    assert.ok(headers['access-control-expose-headers']?.includes('X-Appointment-Diagnostics'));
    assert.ok(headers['access-control-expose-headers']?.includes('Server-Timing'));
    assert.ok(headers['access-control-expose-headers']?.includes('X-Request-Id'));
    assert.ok(headers['access-control-expose-headers']?.includes('X-Correlation-Id'));
    assert.ok(
      headers['cache-control']?.includes('private'),
      'GET de origem permitida deve ter Cache-Control: private no servidor real',
    );
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

suite('CorsMiddleware — rotas públicas cacheáveis com CORS', () => {

  let server;
  let port;

  const qb = () => {
    const q = {
      select: () => q,
      eq:     () => q,
      gte:    () => q,
      lte:    () => q,
      order:  () => q,
      limit:  () => Promise.resolve({ data: [], error: null }),
    };
    return q;
  };

  before(async () => {
    const app = criarApp({
      from: qb,
      rpc:  () => Promise.resolve({ data: [], error: null }),
    });
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

  function request(origin) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/barbearias?lat=-23.5506&lng=-46.6333&raio=5',
          method: 'GET',
          headers: { origin },
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

  test('GET /barbearias de app.barberflow.live reflete origin e bloqueia cache compartilhado', async () => {
    const { status, headers } = await request('https://app.barberflow.live');

    assert.strictEqual(status, 200);
    assert.strictEqual(headers['access-control-allow-origin'], 'https://app.barberflow.live');
    assert.ok(
      headers['cache-control']?.startsWith('private'),
      'rota publica com CORS nao deve sair como public cache',
    );
    assert.strictEqual(headers['cdn-cache-control'], 'no-store');
    assert.strictEqual(headers['surrogate-control'], 'no-store');
  });

  test('GET /barbearias de pro.barberflow.live reflete origin sem reutilizar app', async () => {
    const { status, headers } = await request('https://pro.barberflow.live');

    assert.strictEqual(status, 200);
    assert.strictEqual(headers['access-control-allow-origin'], 'https://pro.barberflow.live');
    assert.ok(headers['cache-control']?.startsWith('private'));
  });
});
