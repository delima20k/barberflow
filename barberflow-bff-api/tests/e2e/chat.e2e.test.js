'use strict';

/**
 * chat.e2e.test.js — E2E: fluxo de chat/mensagens.
 *
 * Cobre:
 *  - GET  /api/v1/chat/conversations/:id/messages — sem auth → 401
 *  - GET  /api/v1/chat/conversations/:id/messages — com auth → 200
 *  - POST /api/v1/chat/conversations/:id/messages — envio → 200/201
 *  - POST /api/v1/chat/conversations/:id/messages — body inválido → 4xx
 *  - DELETE /api/v1/chat/messages/:id             — deleção → 200/404
 *  - Headers de observabilidade presentes
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer, request, gerarToken, TEST_USER_ID } = require('./_app-helper');

// UUIDs válidos (RFC 4122 v4)
const CONV_ID       = 'a1b2c3d4-e5f6-4789-8abc-111122223333';
const MSG_ID        = 'b2c3d4e5-f6a7-4890-9bcd-222233334444';
const OTHER_USER_ID = 'e5f6a7b8-c9d0-4123-8def-555566667777';

const PARTICIPANTS = [
  { user_id: TEST_USER_ID,  joined_at: '2024-01-01T00:00:00Z', left_at: null },
  { user_id: OTHER_USER_ID, joined_at: '2024-01-01T00:00:00Z', left_at: null },
];

const CONV_ROW = {
  id:          CONV_ID,
  created_at:  '2024-01-01T00:00:00Z',
  archived_at: null,
  chat_participants: PARTICIPANTS,
};

const MSG_ROW = {
  id:                      MSG_ID,
  conversation_id:         CONV_ID,
  sender_id:               TEST_USER_ID,
  client_message_id:       'cmi-001',
  body:                    'Olá!',
  created_at:              '2024-01-01T00:00:00Z',
  deleted_at:              null,
  retention_until:         null,
  chat_message_attachments: [],
};

const SAVED_MSG_ROW = {
  id:                      'f1e2d3c4-b5a6-4789-8abc-999988887777',
  conversation_id:         CONV_ID,
  sender_id:               TEST_USER_ID,
  client_message_id:       null,
  body:                    'Olá, tudo bem?',
  created_at:              new Date().toISOString(),
  deleted_at:              null,
  retention_until:         null,
  chat_message_attachments: [],
};

suite('E2E — Chat', () => {
  let server;
  let token;

  before(async () => {
    token = gerarToken({ sub: TEST_USER_ID });

    server = await createTestServer({
      // Conversa com participantes ativos
      chat_conversations:      () => ({ data: CONV_ROW, error: null }),
      // Mensagens da conversa
      chat_messages:           () => ({ data: [MSG_ROW], error: null }),
      chat_message_attachments: () => ({ data: [], error: null }),
      chat_mute_rules:          () => ({ data: [], error: null }),
      // Outbox
      domain_events_outbox:    () => ({ data: { id: 'c9d8e7f6-a5b4-4321-89ab-000011112222' }, error: null }),
      // RPCs de chat
      __rpc_get_chat_messages_reverse: () => ({ data: [MSG_ROW], error: null }),
      __rpc_count_chat_pair_messages:  () => ({ data: 0, error: null }),
      __rpc_has_chat_block:            () => ({ data: false, error: null }),
      __rpc_criar_agendamento_atomico:  () => ({ data: { id: MSG_ID }, error: null }),
    });
  });

  after(async () => {
    await server.close();
  });

  // ── Auth guard ────────────────────────────────────────────────────

  test('GET mensagens — sem token → 401', async () => {
    const { status } = await request(
      server, 'GET', `/api/v1/chat/conversations/${CONV_ID}/messages`,
    );
    assert.strictEqual(status, 401);
  });

  // ── Leitura ───────────────────────────────────────────────────────

  test('GET mensagens — token válido → 200', async () => {
    const { status, body } = await request(
      server, 'GET', `/api/v1/chat/conversations/${CONV_ID}/messages`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.strictEqual(status, 200);
    assert.ok(body.ok !== false, 'resposta deve ser ok');
  });

  // ── Envio ─────────────────────────────────────────────────────────

  test('POST mensagens — envio válido → 2xx', async () => {
    const { status } = await request(
      server, 'POST', `/api/v1/chat/conversations/${CONV_ID}/messages`,
      {
        headers: { Authorization: `Bearer ${token}` },
        body:    { body: 'Olá, tudo bem?', clientMessageId: 'cmi-novo-001' },
      },
    );
    assert.ok(status >= 200 && status < 300, `esperado 2xx, recebeu ${status}`);
  });

  test('POST mensagens — sem auth → 401', async () => {
    const { status } = await request(
      server, 'POST', `/api/v1/chat/conversations/${CONV_ID}/messages`,
      { body: { body: 'Tentativa sem auth' } },
    );
    assert.strictEqual(status, 401);
  });

  test('POST mensagens — conteúdo vazio → 4xx', async () => {
    const { status } = await request(
      server, 'POST', `/api/v1/chat/conversations/${CONV_ID}/messages`,
      {
        headers: { Authorization: `Bearer ${token}` },
        body:    { body: '' },
      },
    );
    assert.ok(status >= 400 && status < 500, `esperado 4xx, recebeu ${status}`);
  });

  // ── Deleção ───────────────────────────────────────────────────────

  test('DELETE mensagem — token válido → 200 ou 404', async () => {
    const { status } = await request(
      server, 'DELETE', `/api/v1/chat/messages/${MSG_ID}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.ok(status === 200 || status === 204 || status === 404, `esperado 200/204/404, recebeu ${status}`);
  });

  test('DELETE mensagem — sem auth → 401', async () => {
    const { status } = await request(
      server, 'DELETE', `/api/v1/chat/messages/${MSG_ID}`,
    );
    assert.strictEqual(status, 401);
  });

  // ── Headers ───────────────────────────────────────────────────────

  test('Resposta inclui x-correlation-id', async () => {
    const { headers } = await request(
      server, 'GET', `/api/v1/chat/conversations/${CONV_ID}/messages`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.ok(headers['x-correlation-id'], 'deve incluir x-correlation-id');
  });
});
