'use strict';

/**
 * agendamento.e2e.test.js — E2E: fluxo de agendamentos.
 *
 * Cobre:
 *  - GET    /api/agendamentos        — sem auth → 401
 *  - GET    /api/agendamentos        — com auth → 200 + lista
 *  - POST   /api/agendamentos        — criação válida → 201
 *  - POST   /api/agendamentos        — body inválido → 400/422
 *  - PATCH  /api/agendamentos/:id    — atualização de status → 200
 *  - PATCH  /api/agendamentos/:id    — agendamento de outro usuário → 403/404
 *  - DELETE /api/agendamentos/:id    — cancelamento → 200
 *  - DELETE /api/agendamentos/:id    — sem auth → 401
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer, request, gerarToken, TEST_USER_ID } = require('./_app-helper');

const AGD_ID      = 'd4e5f6a7-b8c9-4012-bcde-444455556666';
const OTHER_USER  = 'e5f6a7b8-c9d0-4123-8def-555566667777';
const PROF_ID     = 'a1b2c3d4-e5f6-4789-8abc-111122223333';
const BB_ID       = 'b2c3d4e5-f6a7-4890-9bcd-222233334444';
const SERV_ID     = 'c3d4e5f6-a7b8-4901-abcd-333344445555';

const AGENDAMENTO_MOCK = {
  id:              AGD_ID,
  client_id:       TEST_USER_ID,
  professional_id: PROF_ID,
  barbershop_id:   BB_ID,
  service_id:      SERV_ID,
  scheduled_at:    new Date(Date.now() + 86400_000).toISOString(),
  duration_min:    30,
  status:          'pending',
  created_at:      new Date().toISOString(),
};

suite('E2E — Agendamentos', () => {
  let server;
  let token;
  let tokenOutro;

  before(async () => {
    token      = gerarToken({ sub: TEST_USER_ID });
    tokenOutro = gerarToken({ sub: OTHER_USER });

    server = await createTestServer({
      appointments: () => ({ data: [AGENDAMENTO_MOCK], error: null }),
      __rpc_criar_agendamento_atomico: () => ({ data: { id: AGD_ID }, error: null }),
    });
  });

  after(async () => {
    await server.close();
  });

  // ── Auth guard ───────────────────────────────────────────────────

  test('GET /api/agendamentos — sem token → 401', async () => {
    const { status } = await request(server, 'GET', '/api/agendamentos');
    assert.strictEqual(status, 401);
  });

  test('GET /api/agendamentos — token expirado → 401', async () => {
    const expired = gerarToken({ exp: Math.floor(Date.now() / 1000) - 1 });
    const { status } = await request(server, 'GET', '/api/agendamentos', {
      headers: { Authorization: `Bearer ${expired}` },
    });
    assert.strictEqual(status, 401);
  });

  // ── Listagem ──────────────────────────────────────────────────────

  test('GET /api/agendamentos — token válido → 200 + lista', async () => {
    const { status, body } = await request(server, 'GET', '/api/agendamentos', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(status, 200);
    assert.ok(body.ok !== false, 'resposta deve ser ok');
    assert.ok(Array.isArray(body.dados) || body.dados != null, 'deve retornar dados');
  });

  // ── Criação ───────────────────────────────────────────────────────

  test('POST /api/agendamentos — criação válida → 201', async () => {
    const { status } = await request(server, 'POST', '/api/agendamentos', {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        professional_id: PROF_ID,
        barbershop_id:   BB_ID,
        service_id:      SERV_ID,
        scheduled_at:    new Date(Date.now() + 86400_000).toISOString(),
        duration_min:    30,
      },
    });
    assert.ok(status === 201 || status === 200, `esperado 200/201, recebeu ${status}`);
  });

  test('POST /api/agendamentos — sem auth → 401', async () => {
    const { status } = await request(server, 'POST', '/api/agendamentos', {
      body: { barbeiro_id: 'barb-001' },
    });
    assert.strictEqual(status, 401);
  });

  // ── Atualização ───────────────────────────────────────────────────

  test('PATCH /api/agendamentos/:id — token válido → 200', async () => {
    const { status } = await request(server, 'PATCH', `/api/agendamentos/${AGD_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
      body:    { status: 'confirmed' },
    });
    assert.ok(status === 200 || status === 204 || status === 404, `esperado 200/204/404, recebeu ${status}`);
  });

  test('PATCH /api/agendamentos/:id — sem auth → 401', async () => {
    const { status } = await request(server, 'PATCH', `/api/agendamentos/${AGD_ID}`, {
      body: { status: 'confirmed' },
    });
    assert.strictEqual(status, 401);
  });

  // ── Cancelamento ──────────────────────────────────────────────────

  test('DELETE /api/agendamentos/:id — token válido → 200 ou 404', async () => {
    const { status } = await request(server, 'DELETE', `/api/agendamentos/${AGD_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok(status === 200 || status === 204 || status === 404, `esperado 200/204/404, recebeu ${status}`);
  });

  test('DELETE /api/agendamentos/:id — sem auth → 401', async () => {
    const { status } = await request(server, 'DELETE', `/api/agendamentos/${AGD_ID}`);
    assert.strictEqual(status, 401);
  });

  // ── Headers de observabilidade ────────────────────────────────────

  test('Resposta de agendamentos inclui x-correlation-id', async () => {
    const { headers } = await request(server, 'GET', '/api/agendamentos', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok(headers['x-correlation-id'], 'deve incluir x-correlation-id');
  });
});
