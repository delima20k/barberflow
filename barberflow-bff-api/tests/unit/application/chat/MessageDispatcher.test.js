'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { Message } = require('../../../../domain/chat/entities/Message');
const { MessageDispatcher } = require('../../../../application/chat/MessageDispatcher');
const { PresenceLink } = require('../../../../application/chat/PresenceLink');
const { MuteRule } = require('../../../../domain/chat/policies/MuteRule');

function createMessage() {
  return Message.restore({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-a',
    clientMessageId: 'client-1',
    body: 'Oi',
    createdAt: '2026-05-22T12:00:00.000Z',
  });
}

describe('MessageDispatcher', () => {
  it('publica realtime e usa push quando destinatario esta offline', async () => {
    const realtime = [];
    const pushes = [];
    const dispatcher = new MessageDispatcher({
      publishToChannelUseCase: { execute: async event => { realtime.push(event); return { ok: true }; } },
      presenceLink: new PresenceLink({ presenceService: { isPresent: () => false } }),
      pushGateway: { notifyMessage: async payload => pushes.push(payload) },
      blockPolicy: { canExchange: async () => true },
    });

    await dispatcher.dispatch({
      message: createMessage(),
      recipients: ['user-b'],
      muteRules: [],
    });

    assert.deepEqual({
      channel: realtime[0].channel,
      type: realtime[0].type,
      pushUserId: pushes[0].userId,
    }, {
      channel: 'chat.user-b',
      type: 'events.v1.chat.message_created',
      pushUserId: 'user-b',
    });
  });

  it('inclui dados do remetente no payload realtime sem alterar a mensagem canonica', async () => {
    const realtime = [];
    const dispatcher = new MessageDispatcher({
      publishToChannelUseCase: { execute: async event => { realtime.push(event); return { ok: true }; } },
      presenceLink: new PresenceLink({ presenceService: { isPresent: () => true } }),
      pushGateway: { notifyMessage: async () => {} },
      blockPolicy: { canExchange: async () => true },
    });

    await dispatcher.dispatch({
      message: createMessage(),
      recipients: ['user-b'],
      sender: {
        id: 'user-a',
        name: 'Cliente Teste',
        avatarPath: 'user-a/avatar.webp',
        role: 'client',
      },
    });

    assert.deepEqual(realtime[0].payload.message.sender, {
      id: 'user-a',
      name: 'Cliente Teste',
      avatarPath: 'user-a/avatar.webp',
      role: 'client',
    });
    assert.equal(realtime[0].payload.message.senderId, 'user-a');
  });

  it('nao envia push para destinatario online ou mutado', async () => {
    const pushes = [];
    const dispatcher = new MessageDispatcher({
      publishToChannelUseCase: { execute: async () => ({ ok: true }) },
      presenceLink: new PresenceLink({ presenceService: { isPresent: (_channel, userId) => userId === 'online' } }),
      pushGateway: { notifyMessage: async payload => pushes.push(payload) },
      blockPolicy: { canExchange: async () => true },
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });

    await dispatcher.dispatch({
      message: createMessage(),
      recipients: ['online', 'muted'],
      muteRules: [MuteRule.restore({
        conversationId: 'conv-1',
        userId: 'muted',
        mutedUntil: '2026-05-23T00:00:00.000Z',
      })],
    });

    assert.deepEqual(pushes, []);
  });

  it('bloqueio impede realtime e push no dispatcher', async () => {
    const sideEffects = [];
    const dispatcher = new MessageDispatcher({
      publishToChannelUseCase: { execute: async () => sideEffects.push('realtime') },
      presenceLink: new PresenceLink({ presenceService: { isPresent: () => false } }),
      pushGateway: { notifyMessage: async () => sideEffects.push('push') },
      blockPolicy: { canExchange: async () => false },
    });

    await dispatcher.dispatch({ message: createMessage(), recipients: ['user-b'] });

    assert.deepEqual(sideEffects, []);
  });
});
