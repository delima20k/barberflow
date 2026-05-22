'use strict';

/**
 * api-schema.contract.test.js — Testes de contrato da BFF.
 *
 * Valida que cada endpoint retorna os envelopes e shapes canônicas.
 * Rotas reais da aplicação:
 *   /api/auth/*          — auth (lazy DI)
 *   /api/agendamentos/*  — agendamentos (lazy DI)
 *   /api/v1/media/*      — media (DI explícita)
 *   /api/v1/chat/*       — chat  (DI explícita)
 *   /api/v1/notificacoes/* — notificações (lazy DI)
 *   /health/live          — health
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer, request, gerarToken, TEST_USER_ID } = require('../e2e/_app-helper');
const { validate, schemas } = require('./schemas');

const {
  ENVELOPE_OK,
  ENVELOPE_ERRO,
  AUTH_SESSION,
  AGENDAMENTO_LISTA,
  AGENDAMENTO_CRIADO,
  PRESIGNED_RESPONSE,
} = schemas;

const AGD_ID   = 'd4e5f6a7-b8c9-4012-bcde-444455556666';
const PROF_ID  = 'a1b2c3d4-e5f6-4789-8abc-111122223333';
const BB_ID    = 'b2c3d4e5-f6a7-4890-9bcd-222233334444';
const SERV_ID  = 'c3d4e5f6-a7b8-4901-abcd-333344445555';
const CONV_ID  = 'a1b2c3d4-e5f6-4789-8abc-111122223333';
const MEDIA_ID = 'f1e2d3c4-b5a6-4789-8abc-999988887777';

function assertContrato(body, schema, contexto) {
  const erros = validate(body, schema);
  assert.deepStrictEqual(erros, [], `Contrato violado em [${contexto}]:\n${erros.join('\n')}`);
}

suite('Contrato de API — Envelopes e Shapes', () => {
  let server;
  let token;

  before(async () => {
    token = gerarToken({ sub: TEST_USER_ID });

    server = await createTestServer({
      profiles: () => ({ data: { id: TEST_USER_ID, nome: 'Test User' }, error: null }),
      __auth_signIn: async () => ({
        data: {
          user:    { id: TEST_USER_ID, email: 'test@test.com' },
          session: { access_token: token, refresh_token: 'ref-test' },
        },
        error: null,
      }),
      __auth_refresh: async () => ({
        data: {
          user:    { id: TEST_USER_ID, email: 'test@test.com' },
          session: { access_token: token, refresh_token: 'ref-new' },
        },
        error: null,
      }),

      appointments: () => ({
        data: [{
          id: AGD_ID, professional_id: PROF_ID, barbershop_id: BB_ID,
          service_id: SERV_ID, scheduled_at: new Date().toISOString(),
          duration_min: 30, status: 'scheduled',
        }],
        error: null,
      }),
      __rpc_criar_agendamento_atomico: () => ({ data: { id: AGD_ID }, error: null }),

      chat_conversations: () => ({
        data: [{
          id: CONV_ID, unread_count: 0, last_message_at: new Date().toISOString(),
          chat_participants: [{ user_id: TEST_USER_ID }, { user_id: 'e5f6a7b8-c9d0-4123-8def-555566667777' }],
        }],
        error: null,
      }),
      chat_messages:            () => ({ data: [], error: null }),
      chat_message_attachments: () => ({ data: [], error: null }),
      chat_mute_rules:          () => ({ data: [], error: null }),
      domain_events_outbox:     () => ({ data: { id: 'c9d8e7f6-a5b4-4321-89ab-000011112222' }, error: null }),
      __rpc_get_chat_messages_reverse: () => ({ data: [], error: null }),
      __rpc_count_chat_pair_messages:  () => ({ data: 0, error: null }),
      __rpc_has_chat_block:            () => ({ data: false, error: null }),

      media_files: () => ({
        data: {
          id: MEDIA_ID, owner_id: TEST_USER_ID, privacy: 'public', status: 'published',
          media_variants: [{ name: 'original', storage_path: `avatars/${TEST_USER_ID}/${MEDIA_ID}.jpg`, version: 1 }],
        },
        error: null,
      }),
    });
  });

  after(async () => { await server.close(); });

  // ── Envelope de erro ──────────────────────────────────────────────

  suite('Envelope de erro', () => {
    test('404 para rota inexistente → shape { ok: false, error: string }', async () => {
      const { status, body } = await request(server, 'GET', '/api/v1/rota-que-nao-existe-333');
      assert.strictEqual(status, 404);
      assertContrato(body, ENVELOPE_ERRO, '404 rota inexistente');
    });

    test('401 sem token → shape { ok: false, error: string }', async () => {
      // Chat está em /api/v1 e exige autenticação
      const { status, body } = await request(server, 'GET', `/api/v1/chat/conversations/${CONV_ID}/messages`);
      assert.strictEqual(status, 401);
      assertContrato(body, ENVELOPE_ERRO, '401 sem token');
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────

  suite('Auth — /api/auth/*', () => {
    test('POST /api/auth/login → 200 com sessão', async () => {
      const { status, body } = await request(server, 'POST', '/api/auth/login', {
        body: { email: 'test@test.com', password: 'senha123' },
      });
      assert.ok(status === 200 || status === 201, `esperado 2xx, recebeu ${status}`);
      assertContrato(body, AUTH_SESSION, 'POST /api/auth/login');
    });

    test('POST /api/auth/login com credenciais inválidas → shape de erro', async () => {
      const errServer = await createTestServer({
        __auth_signIn: async () => ({ data: null, error: { message: 'Invalid login credentials' } }),
      });
      const { body } = await request(errServer, 'POST', '/api/auth/login', {
        body: { email: 'errado@test.com', password: 'errada' },
      });
      assertContrato(body, ENVELOPE_ERRO, 'POST /api/auth/login credenciais inválidas');
      await errServer.close();
    });
  });

  // ── Agendamentos ──────────────────────────────────────────────────

  suite('Agendamentos — /api/agendamentos/*', () => {
    test('GET /api/agendamentos com token → 200 com lista', async () => {
      const { status, body } = await request(server, 'GET', '/api/agendamentos', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.ok(status === 200, `esperado 200, recebeu ${status}`);
      assertContrato(body, AGENDAMENTO_LISTA, 'GET /api/agendamentos');
    });

    test('POST /api/agendamentos com dados válidos → 2xx com id', async () => {
      const { status, body } = await request(server, 'POST', '/api/agendamentos', {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          professional_id: PROF_ID,
          barbershop_id:   BB_ID,
          service_id:      SERV_ID,
          scheduled_at:    new Date(Date.now() + 86400000).toISOString(),
          duration_min:    30,
        },
      });
      assert.ok(status === 200 || status === 201, `esperado 2xx, recebeu ${status}`);
      assertContrato(body, AGENDAMENTO_CRIADO, 'POST /api/agendamentos');
    });

    test('POST /api/agendamentos com body inválido → shape de erro', async () => {
      const { body } = await request(server, 'POST', '/api/agendamentos', {
        headers: { Authorization: `Bearer ${token}` },
        body: {},
      });
      assertContrato(body, ENVELOPE_ERRO, 'POST /api/agendamentos body inválido');
    });
  });

  // ── Chat ──────────────────────────────────────────────────────────

  suite('Chat — /api/v1/chat/*', () => {
    test('GET /api/v1/chat/conversations/:id/messages → envelope ok', async () => {
      const { status, body } = await request(
        server, 'GET', `/api/v1/chat/conversations/${CONV_ID}/messages`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.ok(status === 200 || status === 403 || status === 404, `recebeu ${status}`);
      if (status === 200) assertContrato(body, ENVELOPE_OK, 'GET chat messages ok');
      else assertContrato(body, ENVELOPE_ERRO, 'GET chat messages erro');
    });

    test('GET /api/v1/chat/conversations/:id/messages sem auth → 401', async () => {
      const { status, body } = await request(
        server, 'GET', `/api/v1/chat/conversations/${CONV_ID}/messages`,
      );
      assert.strictEqual(status, 401);
      assertContrato(body, ENVELOPE_ERRO, 'GET chat sem auth');
    });
  });

  // ── Upload de Mídia ───────────────────────────────────────────────

  suite('Upload de Mídia — /api/v1/media/*', () => {
    test('POST /api/v1/media/presigned → 2xx com shape de upload', async () => {
      const { status, body } = await request(server, 'POST', '/api/v1/media/presigned', {
        headers: { Authorization: `Bearer ${token}` },
        body: { contentType: 'image/jpeg', context: 'avatars', sizeBytes: 102400 },
      });
      assert.ok(status === 200 || status === 201, `esperado 2xx, recebeu ${status}`);
      assertContrato(body, PRESIGNED_RESPONSE, 'POST /api/v1/media/presigned');
    });

    test('POST /api/v1/media/presigned com context inválido → shape de erro', async () => {
      const { body } = await request(server, 'POST', '/api/v1/media/presigned', {
        headers: { Authorization: `Bearer ${token}` },
        body: { contentType: 'image/jpeg', context: 'contexto-invalido', sizeBytes: 102400 },
      });
      assertContrato(body, ENVELOPE_ERRO, 'POST /api/v1/media/presigned context inválido');
    });
  });

  // ── Health ────────────────────────────────────────────────────────

  suite('Health', () => {
    test('GET /health/live → 200 com campo status', async () => {
      const { status, body } = await request(server, 'GET', '/health/live');
      assert.strictEqual(status, 200);
      assert.ok(body.status != null, 'deve ter campo status');
    });
  });
});
