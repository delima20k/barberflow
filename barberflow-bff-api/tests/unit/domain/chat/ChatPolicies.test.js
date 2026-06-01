'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { Conversation } = require('../../../../domain/chat/entities/Conversation');
const { Participant } = require('../../../../domain/chat/entities/Participant');
const { ConversationAccessPolicy } = require('../../../../domain/chat/policies/ConversationAccessPolicy');
const { BlockPolicy } = require('../../../../domain/chat/policies/BlockPolicy');
const { MuteRule } = require('../../../../domain/chat/policies/MuteRule');

describe('Chat policies', () => {
  it('ConversationAccessPolicy permite somente participante ativo', () => {
    const conversation = Conversation.restore({
      id: 'conv-1',
      participants: [
        Participant.restore({ conversationId: 'conv-1', userId: 'user-a' }),
        Participant.restore({ conversationId: 'conv-1', userId: 'user-b', leftAt: '2026-05-22T10:00:00.000Z' }),
      ],
    });

    assert.deepEqual({
      active: ConversationAccessPolicy.canRead(conversation, 'user-a'),
      left: ConversationAccessPolicy.canRead(conversation, 'user-b'),
      stranger: ConversationAccessPolicy.canRead(conversation, 'user-c'),
    }, {
      active: true,
      left: false,
      stranger: false,
    });
  });

  it('BlockPolicy bloqueia ambos os sentidos sem expor canal paralelo', async () => {
    const policy = new BlockPolicy({
      blockRepository: {
        hasBidirectionalBlock: async (left, right) => left === 'user-a' && right === 'user-b',
      },
    });

    assert.equal(await policy.canExchange('user-a', 'user-b'), false);
  });

  it('MuteRule silencia push sem impedir persistencia e realtime', () => {
    const muted = MuteRule.restore({
      conversationId: 'conv-1',
      userId: 'user-b',
      mutedUntil: '2026-05-23T00:00:00.000Z',
    });

    assert.deepEqual({
      mutedNow: muted.shouldSkipPush(new Date('2026-05-22T12:00:00.000Z')),
      mutedAfterExpiry: muted.shouldSkipPush(new Date('2026-05-24T12:00:00.000Z')),
    }, {
      mutedNow: true,
      mutedAfterExpiry: false,
    });
  });
});
