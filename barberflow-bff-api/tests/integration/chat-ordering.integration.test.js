'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SendMessageUseCase } = require('../../application/chat/SendMessageUseCase');
const { InMemoryChatRepository } = require('../../infrastructure/chat/InMemoryChatRepository');

const encryptedPayload = ct => ({ v: 1, alg: 'AES-GCM-256', iv: 'iv', ct, kid: 'peer' });

describe('[Integration] Chat ordering', () => {
  it('duas mensagens simultaneas mantem ordem total e cursor reverso estavel', async () => {
    const chatRepository = new InMemoryChatRepository({
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });
    chatRepository.seedConversation({ id: 'conv-1', participantIds: ['user-a', 'user-b'] });
    const useCase = new SendMessageUseCase({
      chatRepository,
      outboxRepository: { save: async () => 'outbox-chat' },
      blockPolicy: { canExchange: async () => true },
    });

    await Promise.all([
      useCase.execute({
        conversationId: 'conv-1',
        senderId: 'user-a',
        clientMessageId: 'client-1',
        body: null,
        encryptedPayload: encryptedPayload('primeira'),
      }),
      useCase.execute({
        conversationId: 'conv-1',
        senderId: 'user-b',
        clientMessageId: 'client-2',
        body: null,
        encryptedPayload: encryptedPayload('segunda'),
      }),
    ]);
    const firstPage = await chatRepository.listMessagesReverse({ conversationId: 'conv-1', limit: 1 });
    const secondPage = await chatRepository.listMessagesReverse({
      conversationId: 'conv-1',
      limit: 1,
      cursor: firstPage.nextCursor,
    });

    assert.deepEqual({
      uniqueIds: new Set([firstPage.items[0].id, secondPage.items[0].id]).size,
      total: firstPage.items.length + secondPage.items.length,
      firstIsNewer: firstPage.items[0].sortKey > secondPage.items[0].sortKey,
    }, {
      uniqueIds: 2,
      total: 2,
      firstIsNewer: true,
    });
  });
});
