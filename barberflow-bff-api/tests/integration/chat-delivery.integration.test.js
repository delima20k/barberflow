'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SendMessageUseCase } = require('../../application/chat/SendMessageUseCase');
const { ChatDeliveryHandler } = require('../../application/handlers/ChatDeliveryHandler');
const { MessageDispatcher } = require('../../application/chat/MessageDispatcher');
const { PresenceLink } = require('../../application/chat/PresenceLink');
const { InMemoryChatRepository } = require('../../infrastructure/chat/InMemoryChatRepository');
const { JOB_TYPES, QUEUES } = require('../../config/queues');

describe('[Integration] Chat delivery outbox', () => {
  it('envio salva, agenda outbox, publica realtime e cai para push quando offline', async () => {
    const chatRepository = new InMemoryChatRepository();
    chatRepository.seedConversation({ id: 'conv-1', participantIds: ['user-a', 'user-b'] });
    const outboxEvents = [];
    const useCase = new SendMessageUseCase({
      chatRepository,
      outboxRepository: { save: async event => { outboxEvents.push(event); return 'outbox-chat'; } },
      blockPolicy: { canExchange: async () => true },
    });
    const realtimeEvents = [];
    const pushEvents = [];
    const dispatcher = new MessageDispatcher({
      publishToChannelUseCase: { execute: async event => { realtimeEvents.push(event); return { ok: true }; } },
      presenceLink: new PresenceLink({ presenceService: { isPresent: () => false } }),
      pushGateway: { notifyMessage: async payload => pushEvents.push(payload) },
      blockPolicy: { canExchange: async () => true },
    });
    const handler = new ChatDeliveryHandler({ chatRepository, messageDispatcher: dispatcher });

    const result = await useCase.execute({
      conversationId: 'conv-1',
      senderId: 'user-a',
      clientMessageId: 'client-msg-1',
      body: 'Mensagem confiavel',
    });
    await handler.handle({ payload: outboxEvents[0].payload });

    assert.deepEqual({
      ok: result.isOk(),
      outboxType: outboxEvents[0].eventName,
      queue: outboxEvents[0].queue,
      realtimeChannel: realtimeEvents[0].channel,
      pushUserId: pushEvents[0].userId,
    }, {
      ok: true,
      outboxType: JOB_TYPES.DELIVER_CHAT_MESSAGE,
      queue: QUEUES.NOTIFICATIONS,
      realtimeChannel: 'chat.user-b',
      pushUserId: 'user-b',
    });
  });

  it('envio publica realtime imediato apos persistir no banco', async () => {
    const chatRepository = new InMemoryChatRepository();
    chatRepository.seedConversation({ id: 'conv-1', participantIds: ['user-a', 'user-b'] });
    const realtimeImmediate = [];
    const useCase = new SendMessageUseCase({
      chatRepository,
      outboxRepository: { save: async () => 'outbox-chat' },
      blockPolicy: { canExchange: async () => true },
      messageRealtimePublisher: {
        publish: async payload => realtimeImmediate.push(payload),
      },
    });

    const result = await useCase.execute({
      conversationId: 'conv-1',
      senderId: 'user-a',
      clientMessageId: 'client-msg-2',
      body: 'Mensagem em tempo real',
    });

    assert.deepEqual({
      ok: result.isOk(),
      recipientId: realtimeImmediate[0].recipients[0],
      body: realtimeImmediate[0].message.body,
      senderId: realtimeImmediate[0].message.senderId,
    }, {
      ok: true,
      recipientId: 'user-b',
      body: 'Mensagem em tempo real',
      senderId: 'user-a',
    });
  });
});
