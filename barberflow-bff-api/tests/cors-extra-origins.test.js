'use strict';

// =============================================================
// cors-extra-origins.test.js
//
// Testa que a env var CORS_EXTRA_ORIGINS adiciona origens
// dinamicamente ao CorsMiddleware sem necessidade de redeploy.
//
// IMPORTANTE: este arquivo DEVE ser separado de cors.test.js
// porque process.env.CORS_EXTRA_ORIGINS precisa estar definida
// ANTES do primeiro require('../middlewares/cors'). Como node:test
// roda cada arquivo em processo isolado, o isolamento é garantido.
// =============================================================

// ── Env deve ser configurada antes de qualquer require ────────────
process.env.APP_ENV                   = 'production';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-supabase-jwt-secret-for-testing-only-32chars';
process.env.CORS_EXTRA_ORIGINS        = 'https://nova-origem.berberflow.shop,  https://outra-nova.berberflow.shop  ';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const { criarMocks } = require('./_helpers');
const CorsMiddleware  = require('../middlewares/cors');

// ─── Suite: CORS_EXTRA_ORIGINS env var ───────────────────────────

suite('CorsMiddleware — CORS_EXTRA_ORIGINS env var', () => {

  test('origem adicionada via CORS_EXTRA_ORIGINS recebe Access-Control-Allow-Origin', () => {
    const origin = 'https://nova-origem.berberflow.shop';
    const { req, res, next, captured } = criarMocks({ headers: { origin }, method: 'GET' });

    CorsMiddleware.handle(req, res, next);

    assert.strictEqual(
      captured.headers['Access-Control-Allow-Origin'],
      origin,
      'origem via CORS_EXTRA_ORIGINS deve receber ACAO header',
    );
    assert.strictEqual(captured.headers['Access-Control-Allow-Credentials'], 'true');
    assert.strictEqual(next.calls.length, 1, 'next() deve ser chamado após GET permitido');
  });

  test('segunda origem (com espaços no CSV) também é aceita', () => {
    const origin = 'https://outra-nova.berberflow.shop';
    const { req, res, next, captured } = criarMocks({ headers: { origin }, method: 'GET' });

    CorsMiddleware.handle(req, res, next);

    assert.strictEqual(
      captured.headers['Access-Control-Allow-Origin'],
      origin,
      'segunda origem do CSV (com espaços extra) deve ser aceita após trim()',
    );
  });

  test('origens base de produção continuam aceitas com CORS_EXTRA_ORIGINS setado', () => {
    for (const origin of ['https://app.berberflow.shop', 'https://pro.berberflow.shop']) {
      const { req, res, captured } = criarMocks({ headers: { origin }, method: 'GET' });

      CorsMiddleware.handle(req, res, () => {});

      assert.strictEqual(
        captured.headers['Access-Control-Allow-Origin'],
        origin,
        `"${origin}" deve continuar permitida`,
      );
    }
  });

  test('origem fora da lista não é aceita mesmo com CORS_EXTRA_ORIGINS setado', () => {
    const origin = 'https://atacante.com';
    const { req, res, next, captured } = criarMocks({ headers: { origin }, method: 'GET' });

    CorsMiddleware.handle(req, res, next);

    assert.ok(
      !captured.headers['Access-Control-Allow-Origin'],
      'origem não listada não deve receber ACAO header',
    );
  });

  test('OPTIONS de origem via CORS_EXTRA_ORIGINS retorna 200 com preflight completo', () => {
    const origin = 'https://nova-origem.berberflow.shop';
    const { req, res, next, captured } = criarMocks({ headers: { origin }, method: 'OPTIONS' });

    CorsMiddleware.handle(req, res, next);

    assert.strictEqual(captured.status, 200, 'preflight deve responder 200');
    assert.strictEqual(captured.headers['Access-Control-Allow-Origin'], origin);
    assert.ok(captured.headers['Access-Control-Allow-Methods']?.includes('GET'));
    assert.ok(captured.headers['Access-Control-Allow-Headers']?.includes('Authorization'));
    assert.strictEqual(next.calls.length, 0, 'next() NÃO deve ser chamado após OPTIONS');
  });
});
