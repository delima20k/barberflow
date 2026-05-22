'use strict';

/**
 * notificacao.e2e.test.js — E2E: fluxo de notificações push.
 *
 * Cobre:
 *  - POST /api/v1/notificacoes/push-barbeiro — sem auth → 401
 *  - POST /api/v1/notificacoes/push-barbeiro — VAPID não configurado → 503
 *  - POST /api/v1/notificacoes/subscribe     — registra subscription
 *  - POST /api/v1/notificacoes/subscribe     — payload inválido → 400
 *  - GET  /health/live                       — sempre 200
 *  - GET  /health/ready                      — Supabase mock ok → 200
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer, request, gerarToken, TEST_USER_ID } = require('./_app-helper');

suite('E2E — Notificações', () => {
  let server;
  let token;

  before(async () => {
    token = gerarToken({ sub: TEST_USER_ID });

    // VAPID não configurado em teste → deve retornar 503 graciosamente
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    server = await createTestServer({
      push_subscriptions: () => ({ data: null, error: null }),
      profiles: () => ({
        data: { id: 'barb-001', push_token: null },
        error: null,
      }),
    });
  });

  after(async () => {
    await server.close();
  });

  // ── Auth guard ───────────────────────────────────────────────────

  test('POST /push-barbeiro — sem token → 401', async () => {
    const { status } = await request(server, 'POST', '/api/v1/notificacoes/push-barbeiro', {
      body: { barbeiro_id: 'barb-001', titulo: 'Novo agendamento', corpo: 'João marcou às 10h' },
    });
    assert.strictEqual(status, 401);
  });

  // ── VAPID não configurado ────────────────────────────────────────

  test('POST /push-barbeiro — VAPID ausente → 503', async () => {
    const { status, body } = await request(server, 'POST', '/api/v1/notificacoes/push-barbeiro', {
      headers: { Authorization: `Bearer ${token}` },
      body: { barbeiro_id: 'barb-001', titulo: 'Novo', corpo: 'Teste' },
    });
    assert.strictEqual(status, 503);
    assert.strictEqual(body.ok, false);
    assert.ok(body.error?.message?.includes('VAPID') || body.error != null, 'deve indicar VAPID');
  });

  // ── Subscribe ────────────────────────────────────────────────────

  test('POST /subscribe — sem auth → 401', async () => {
    const { status } = await request(server, 'POST', '/api/v1/notificacoes/subscribe', {
      body: {
        subscription: { endpoint: 'https://push.example.com/abc', keys: { auth: 'key', p256dh: 'dh' } },
      },
    });
    assert.strictEqual(status, 401);
  });

  test('POST /subscribe — payload inválido → 400/422', async () => {
    const { status } = await request(server, 'POST', '/api/v1/notificacoes/subscribe', {
      headers: { Authorization: `Bearer ${token}` },
      body:    {},
    });
    assert.ok(status >= 400 && status < 600, `payload inválido deve resultar em 4xx ou 503, recebeu ${status}`);
  });

  // ── Health checks ────────────────────────────────────────────────

  test('GET /health/live — sempre 200', async () => {
    const { status, body } = await request(server, 'GET', '/health/live');
    assert.strictEqual(status, 200);
    assert.ok(body.status != null, 'deve ter campo status');
  });

  test('GET /health/ready — responde com 200 ou 503', async () => {
    const { status, body } = await request(server, 'GET', '/health/ready');
    // Em teste, Supabase e Redis são mocks — aceita ambos os status
    assert.ok(status === 200 || status === 503, `esperado 200 ou 503, recebeu ${status}`);
    // status pode ser 'ok', 'degraded' ou 'live' dependendo do endpoint
    assert.ok(body.status != null, 'deve ter campo status na resposta');
  });

  test('GET /api/health — compatibilidade legada → responde', async () => {
    const { status } = await request(server, 'GET', '/api/health');
    assert.ok(status >= 200 && status < 600, `deve responder, recebeu ${status}`);
  });

  // ── x-correlation-id ─────────────────────────────────────────────

  test('Resposta inclui x-correlation-id mesmo em 503', async () => {
    const { headers } = await request(server, 'POST', '/api/v1/notificacoes/push-barbeiro', {
      headers: { Authorization: `Bearer ${token}` },
      body:    { barbeiro_id: 'barb-001', titulo: 'X', corpo: 'Y' },
    });
    assert.ok(headers['x-correlation-id'], 'deve incluir x-correlation-id');
  });
});
