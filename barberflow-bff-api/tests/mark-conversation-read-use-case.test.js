'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { MarkConversationReadUseCase } = require('../application/chat/MarkConversationReadUseCase');

class FakeChatRepository {
  #result;
  #calls = [];

  constructor(result = null) {
    this.#result = result;
  }

  get calls() { return this.#calls; }

  async markConversationRead(conversationId, userId) {
    this.#calls.push({ conversationId, userId });
    return this.#result;
  }
}

describe('MarkConversationReadUseCase', () => {
  test('rejeita sem conversationId', async () => {
    const uc = new MarkConversationReadUseCase({ chatRepository: new FakeChatRepository() });
    const result = await uc.execute({ userId: 'user-a' });

    assert.equal(result.ok, false);
  });

  test('rejeita sem userId', async () => {
    const uc = new MarkConversationReadUseCase({ chatRepository: new FakeChatRepository() });
    const result = await uc.execute({ conversationId: 'conv-a' });

    assert.equal(result.ok, false);
  });

  test('marca conversa como lida pelo repositorio', async () => {
    const repo = new FakeChatRepository({
      conversationId: 'conv-a',
      lastReadMessageId: 'msg-a',
      unreadCount: 0,
    });
    const uc = new MarkConversationReadUseCase({ chatRepository: repo });

    const result = await uc.execute({ conversationId: 'conv-a', userId: 'user-a' });

    assert.equal(result.ok, true);
    assert.deepEqual(repo.calls[0], { conversationId: 'conv-a', userId: 'user-a' });
    assert.deepEqual(result.value, {
      conversationId: 'conv-a',
      lastReadMessageId: 'msg-a',
      unreadCount: 0,
    });
  });

  test('falha quando usuario nao participa da conversa', async () => {
    const uc = new MarkConversationReadUseCase({ chatRepository: new FakeChatRepository(null) });
    const result = await uc.execute({ conversationId: 'conv-a', userId: 'user-fora' });

    assert.equal(result.ok, false);
  });

  test('lanca se chatRepository nao for fornecido', () => {
    assert.throws(
      () => new MarkConversationReadUseCase({}),
      /obrigatorio/i,
    );
  });
});
