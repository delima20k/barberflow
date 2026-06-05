'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { Message } = require('../../../../domain/chat/entities/Message');

const BASE = {
  conversationId:  'conv-abc',
  senderId:        'user-abc',
  clientMessageId: 'client-001',
};

const ENCRYPTED_PAYLOAD = { v: 1, alg: 'AES-GCM-256', iv: 'abc123', ct: 'xyz456', kid: 'peer-001' };

describe('Message — suporte a encrypted_payload', () => {

  // ── create ──────────────────────────────────────────────────

  test('create aceita encrypted_payload sem body', () => {
    const result = Message.create({ ...BASE, body: '', encryptedPayload: ENCRYPTED_PAYLOAD });
    assert.equal(result.isFail(), false, 'deve criar mensagem com encrypted_payload');
    assert.deepEqual(result.getValue().encryptedPayload, ENCRYPTED_PAYLOAD);
  });

  test('create aceita encrypted_payload com body null', () => {
    const result = Message.create({ ...BASE, body: null, encryptedPayload: ENCRYPTED_PAYLOAD });
    assert.equal(result.isFail(), false, 'deve aceitar body null com encrypted_payload');
  });

  test('create rejeita mensagem sem body, sem attachments e sem encrypted_payload', () => {
    const result = Message.create({ ...BASE, body: '' });
    assert.equal(result.isFail(), true);
    assert.match(result.getError(), /encrypted_payload|anexo/);
  });

  test('create rejeita body puro com texto válido (E2E obrigatório)', () => {
    // Mensagens com texto agora exigem encrypted_payload — body puro não é aceito
    const result = Message.create({ ...BASE, body: 'Oi!' });
    assert.equal(result.isFail(), true, 'body puro deve ser rejeitado');
    assert.match(result.getError(), /encrypted_payload|texto puro/i);
  });

  test('create rejeita qualquer body não vazio sem encrypted_payload', () => {
    const result = Message.create({ ...BASE, body: 'mensagem secreta', encryptedPayload: null });
    assert.equal(result.isFail(), true);
  });

  test('create preserva e2eKeyVersion quando fornecido', () => {
    const result = Message.create({ ...BASE, body: '', encryptedPayload: ENCRYPTED_PAYLOAD, e2eKeyVersion: 2 });
    assert.equal(result.isFail(), false);
    assert.equal(result.getValue().e2eKeyVersion, 2);
  });

  // ── toJSON ───────────────────────────────────────────────────

  test('toJSON inclui encryptedPayload e e2eKeyVersion', () => {
    const msg  = Message.create({ ...BASE, body: '', encryptedPayload: ENCRYPTED_PAYLOAD, e2eKeyVersion: 1 }).getValue();
    const json = msg.toJSON();
    assert.deepEqual(json.encryptedPayload, ENCRYPTED_PAYLOAD);
    assert.equal(json.e2eKeyVersion, 1);
  });

  test('restore (leitura legada): body legado mantém encryptedPayload null', () => {
    // restore() aceita body legado para compatibilidade retroativa de leitura
    const msg  = Message.restore({
      id: 'legacy-01', ...BASE, body: 'olá', encryptedPayload: null, createdAt: new Date(),
    });
    assert.equal(msg.encryptedPayload, null);
    assert.equal(msg.body, 'olá');
  });

  // ── softDelete ───────────────────────────────────────────────

  test('softDelete limpa encryptedPayload junto com body', () => {
    const msg     = Message.create({ ...BASE, body: '', encryptedPayload: ENCRYPTED_PAYLOAD }).getValue();
    const deleted = msg.softDelete({ deletedAt: new Date(), retentionUntil: new Date() });
    assert.equal(deleted.encryptedPayload, null, 'encryptedPayload deve ser null após soft delete');
    assert.equal(deleted.body, '');
  });

  // ── restore ──────────────────────────────────────────────────

  test('restore mapeia encrypted_payload do banco', () => {
    const msg = Message.restore({
      id:               'msg-001',
      conversationId:   'conv-abc',
      senderId:         'user-abc',
      clientMessageId:  'client-001',
      body:             '',
      encryptedPayload: ENCRYPTED_PAYLOAD,
      e2eKeyVersion:    1,
      createdAt:        new Date(),
    });
    assert.deepEqual(msg.encryptedPayload, ENCRYPTED_PAYLOAD);
    assert.equal(msg.e2eKeyVersion, 1);
  });

  test('restore aceita body legado com texto (compatibilidade retroativa)', () => {
    // restore() é somente para LEITURA de mensagens antigas — não valida E2E
    const msg = Message.restore({
      id: 'legacy-02', conversationId: 'conv-abc', senderId: 'user-abc',
      clientMessageId: 'cid-leg', body: 'mensagem antiga', createdAt: new Date(),
    });
    assert.equal(msg.body, 'mensagem antiga');
    assert.equal(msg.encryptedPayload, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SendMessageUseCase com encrypted_payload
// ─────────────────────────────────────────────────────────────────────────────

const { SendMessageUseCase } = require('../../../../application/chat/SendMessageUseCase');
const { Conversation } = require('../../../../domain/chat/entities/Conversation');

const makeConversation = () => Conversation.restore({
  id: 'conv-abc',
  participants: [
    { conversationId: 'conv-abc', userId: 'user-abc' },
    { conversationId: 'conv-abc', userId: 'user-xyz' },
  ],
});

describe('SendMessageUseCase — encrypted_payload', () => {

  test('salva mensagem com encryptedPayload (body vazio na entidade)', async () => {
    let saved = null;
    const repo = {
      findByClientMessageId:    async () => null,
      findConversation:         async () => makeConversation(),
      countRecentPairMessages:  async () => 0,
      countRecentDuplicateBodies: async () => 0,
      saveMessage: async (msg) => { saved = msg; return msg; },
      findDeliveryContext: async () => null,
    };
    const blockPolicy = { canExchange: async () => true };
    const outbox      = { save: async () => {} };

    const useCase = new SendMessageUseCase({ chatRepository: repo, outboxRepository: outbox, blockPolicy });
    const result  = await useCase.execute({
      conversationId:   'conv-abc',
      senderId:         'user-abc',
      clientMessageId:  'cid-001',
      body:             null,   // controller passa null
      encryptedPayload: ENCRYPTED_PAYLOAD,
    });

    assert.equal(result.isFail(), false, 'deve salvar mensagem cifrada');
    assert.deepEqual(saved.encryptedPayload, ENCRYPTED_PAYLOAD);
    // entidade representa body como '' internamente (null ?? '' = '')
    assert.equal(saved.body, '');
  });

  test('rejeita mensagem com body puro (sem encrypted_payload)', async () => {
    const repo = {
      findByClientMessageId: async () => null,
      findConversation:      async () => makeConversation(),
      countRecentPairMessages: async () => 0,
      countRecentDuplicateBodies: async () => 0,
      saveMessage: async (msg) => msg,
      findDeliveryContext: async () => null,
    };
    const blockPolicy = { canExchange: async () => true };
    const outbox      = { save: async () => {} };

    const useCase = new SendMessageUseCase({ chatRepository: repo, outboxRepository: outbox, blockPolicy });
    const result  = await useCase.execute({
      conversationId:  'conv-abc',
      senderId:        'user-abc',
      clientMessageId: 'cid-puro',
      body:            'texto em claro',
      encryptedPayload: null,
    });

    assert.equal(result.isFail(), true, 'deve rejeitar body puro');
    assert.match(result.getError(), /encrypted_payload|texto puro/i);
  });

  test('idempotência: retorna mensagem existente sem nova persistência', async () => {
    const existente = Message.create({
      conversationId: 'conv-abc', senderId: 'user-abc',
      clientMessageId: 'cid-dup', body: '', encryptedPayload: ENCRYPTED_PAYLOAD,
    }).getValue();

    let saveCount = 0;
    const repo = {
      findByClientMessageId: async () => existente,
      findConversation:      async () => makeConversation(),
      saveMessage:           async () => { saveCount++; return existente; },
      countRecentPairMessages: async () => 0,
      countRecentDuplicateBodies: async () => 0,
      findDeliveryContext: async () => null,
    };
    const blockPolicy = { canExchange: async () => true };
    const outbox      = { save: async () => {} };

    const useCase = new SendMessageUseCase({ chatRepository: repo, outboxRepository: outbox, blockPolicy });
    const result  = await useCase.execute({
      conversationId: 'conv-abc', senderId: 'user-abc', clientMessageId: 'cid-dup', body: null,
    });

    assert.equal(result.isFail(), false);
    assert.equal(saveCount, 0, 'saveMessage NÃO deve ser chamado para mensagem já existente');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regra de validação do controller — testada via lógica pura
// (ChatController importa dependências pesadas; testamos a regra isolada)
// ─────────────────────────────────────────────────────────────────────────────

describe('Regra de validação do controller — body puro', () => {

  // Replica a guarda exata do ChatController.send():
  //   if (!encrypted_payload && body?.trim()) → rejeitar
  function validarPayloadEnvio({ encrypted_payload, body }) {
    if (!encrypted_payload && body?.trim()) {
      return { ok: false, erro: 'Mensagem nova requer encrypted_payload. Envio em texto puro bloqueado.' };
    }
    return { ok: true };
  }

  test('rejeita body puro sem encrypted_payload', () => {
    const r = validarPayloadEnvio({ body: 'olá', encrypted_payload: null });
    assert.equal(r.ok, false);
    assert.match(r.erro, /encrypted_payload|texto puro/);
  });

  test('rejeita body puro mesmo com texto longo', () => {
    const r = validarPayloadEnvio({ body: 'x'.repeat(200), encrypted_payload: undefined });
    assert.equal(r.ok, false);
  });

  test('aceita encrypted_payload sem body', () => {
    const r = validarPayloadEnvio({ encrypted_payload: ENCRYPTED_PAYLOAD, body: undefined });
    assert.equal(r.ok, true);
  });

  test('aceita encrypted_payload com body vazio (body vem como null do controller)', () => {
    const r = validarPayloadEnvio({ encrypted_payload: ENCRYPTED_PAYLOAD, body: null });
    assert.equal(r.ok, true);
  });

  test('body vazio sem encrypted_payload não é bloqueado pela guarda do controller (vai ao entity)', () => {
    // body.trim() === '' → !body?.trim() → guarda passa; a rejeição fica no Message.create
    const r = validarPayloadEnvio({ encrypted_payload: null, body: '' });
    assert.equal(r.ok, true, 'guarda do controller só bloqueia body com texto; entity bloqueia o resto');
  });
});
