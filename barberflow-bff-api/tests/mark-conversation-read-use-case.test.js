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

class FakeReadPublisher {
  #calls = [];

  get calls() { return this.#calls; }

  async publish(payload) {
    this.#calls.push(payload);
  }
}

class FailingReadPublisher {
  async publish() {
    throw new Error('realtime indisponivel');
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

  test('publica evento realtime privado depois de persistir leitura', async () => {
    const repo = new FakeChatRepository({
      conversationId: 'conv-a',
      lastReadMessageId: 'msg-a',
      unreadCount: 0,
    });
    const publisher = new FakeReadPublisher();
    const uc = new MarkConversationReadUseCase({
      chatRepository: repo,
      readPublisher: publisher,
    });

    const result = await uc.execute({ conversationId: 'conv-a', userId: 'user-a' });

    assert.equal(result.ok, true);
    assert.deepEqual(publisher.calls[0], {
      conversationId: 'conv-a',
      userId: 'user-a',
      lastReadMessageId: 'msg-a',
      unreadCount: 0,
    });
  });

  test('falha quando usuario nao participa da conversa', async () => {
    const uc = new MarkConversationReadUseCase({ chatRepository: new FakeChatRepository(null) });
    const result = await uc.execute({ conversationId: 'conv-a', userId: 'user-fora' });

    assert.equal(result.ok, false);
  });

  test('nao falha leitura quando publisher realtime falha', async () => {
    const repo = new FakeChatRepository({
      conversationId: 'conv-a',
      lastReadMessageId: 'msg-a',
      unreadCount: 0,
    });
    const uc = new MarkConversationReadUseCase({
      chatRepository: repo,
      readPublisher: new FailingReadPublisher(),
    });

    const result = await uc.execute({ conversationId: 'conv-a', userId: 'user-a' });

    assert.equal(result.ok, true);
  });

  test('lanca se chatRepository nao for fornecido', () => {
    assert.throws(
      () => new MarkConversationReadUseCase({}),
      /obrigatorio/i,
    );
  });
});
