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

  test('create rejeita mensagem sem body, sem attachments e sem encrypted_payload', () => {
    const result = Message.create({ ...BASE, body: '' });
    assert.equal(result.isFail(), true);
    assert.match(result.getError(), /encrypted_payload/);
  });

  test('create aceita body não vazio sem encrypted_payload (modo legado)', () => {
    const result = Message.create({ ...BASE, body: 'Oi!' });
    assert.equal(result.isFail(), false);
    assert.equal(result.getValue().encryptedPayload, null);
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

  test('toJSON com body legado mantém encryptedPayload null', () => {
    const msg  = Message.create({ ...BASE, body: 'olá' }).getValue();
    const json = msg.toJSON();
    assert.equal(json.encryptedPayload, null);
    assert.equal(json.body, 'olá');
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

const makeRepo = (saved = null) => ({
  findByClientMessageId: async () => null,
  findConversation:      async () => makeConversation(),
  countRecentPairMessages: async () => 0,
  countRecentDuplicateBodies: async () => 0,
  saveMessage: async (msg) => { saved = msg; return msg; },
  _getSaved: () => saved,
  findDeliveryContext: async () => null,
});

describe('SendMessageUseCase — encrypted_payload', () => {

  test('salva mensagem com encryptedPayload e body vazio', async () => {
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

    const useCase = new SendMessageUseCase({
      chatRepository: repo,
      outboxRepository: outbox,
      blockPolicy,
    });

    const result = await useCase.execute({
      conversationId:   'conv-abc',
      senderId:         'user-abc',
      clientMessageId:  'cid-001',
      body:             '',
      encryptedPayload: ENCRYPTED_PAYLOAD,
    });

    assert.equal(result.isFail(), false, 'deve salvar mensagem cifrada');
    assert.deepEqual(saved.encryptedPayload, ENCRYPTED_PAYLOAD);
    assert.equal(saved.body, '');
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
    const result  = await useCase.execute({ conversationId: 'conv-abc', senderId: 'user-abc', clientMessageId: 'cid-dup', body: '' });

    assert.equal(result.isFail(), false);
    assert.equal(saveCount, 0, 'saveMessage NÃO deve ser chamado para mensagem já existente');
  });
});
