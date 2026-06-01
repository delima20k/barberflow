'use strict';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { ListConversationsUseCase } = require('../application/chat/ListConversationsUseCase');

// ── Repositório em memória para testes ──────────────────────

class FakeChatRepository {
  #conversas;
  constructor(conversas = []) { this.#conversas = conversas; }
  async listConversationsForUser(_userId) { return this.#conversas; }
}

// ── Dados de fixture ─────────────────────────────────────────

const CONV_A = {
  id:   'conv-1',
  type: 'direct',
  createdAt: '2026-06-01T10:00:00Z',
  lastMessage: { body: 'Oi', createdAt: '2026-06-01T11:00:00Z', senderId: 'user-b' },
  unreadCount: 2,
  otherParticipantIds: ['user-b'],
};
const CONV_B = {
  id:   'conv-2',
  type: 'direct',
  createdAt: '2026-06-01T09:00:00Z',
  lastMessage: { body: 'Tudo bem', createdAt: '2026-06-01T10:30:00Z', senderId: 'user-c' },
  unreadCount: 0,
  otherParticipantIds: ['user-c'],
};

describe('ListConversationsUseCase', () => {

  test('rejeita sem userId', async () => {
    const uc = new ListConversationsUseCase({ chatRepository: new FakeChatRepository() });
    const r = await uc.execute({});
    assert.equal(r.ok, false);
    assert.ok(r.error, 'deve retornar mensagem de erro');
  });

  test('retorna lista vazia quando não há conversas', async () => {
    const uc = new ListConversationsUseCase({ chatRepository: new FakeChatRepository([]) });
    const r = await uc.execute({ userId: 'user-a' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.items, []);
  });

  test('retorna conversas com estrutura correta', async () => {
    const uc = new ListConversationsUseCase({ chatRepository: new FakeChatRepository([CONV_A, CONV_B]) });
    const r = await uc.execute({ userId: 'user-a' });
    assert.equal(r.ok, true);
    assert.equal(r.value.items.length, 2);
    assert.equal(r.value.items[0].id, 'conv-1');
    assert.equal(r.value.items[0].unreadCount, 2);
  });

  test('inclui lastMessage quando existe', async () => {
    const uc = new ListConversationsUseCase({ chatRepository: new FakeChatRepository([CONV_A]) });
    const r = await uc.execute({ userId: 'user-a' });
    assert.ok(r.value.items[0].lastMessage, 'deve incluir lastMessage');
    assert.equal(r.value.items[0].lastMessage.body, 'Oi');
  });

  test('lança se chatRepository não for fornecido', () => {
    assert.throws(
      () => new ListConversationsUseCase({}),
      /obrigatorio/i
    );
  });
});
