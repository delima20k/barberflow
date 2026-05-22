'use strict';

const { EVENT_TYPES } = require('../../config/realtime');
const { PresenceLink } = require('./PresenceLink');

class TypingIndicator {
  #chatRepository;
  #blockPolicy;
  #publishToChannelUseCase;

  constructor({ chatRepository, blockPolicy, publishToChannelUseCase }) {
    if (!chatRepository || !blockPolicy || !publishToChannelUseCase) {
      throw new TypeError('TypingIndicator requer repository, blockPolicy e realtime publisher.');
    }
    this.#chatRepository = chatRepository;
    this.#blockPolicy = blockPolicy;
    this.#publishToChannelUseCase = publishToChannelUseCase;
  }

  async publish({ conversationId, senderId, active }) {
    const conversation = await this.#chatRepository.findConversation(conversationId);
    if (!conversation?.participant(senderId)?.isActive) return;
    await Promise.all(conversation.recipientIds(senderId).map(async recipientId => {
      if (!(await this.#blockPolicy.canExchange(senderId, recipientId))) return;
      await this.#publishToChannelUseCase.execute({
        channel: PresenceLink.userChannel(recipientId),
        type: EVENT_TYPES.CHAT_TYPING_CHANGED,
        payload: { conversationId, senderId, active: Boolean(active) },
      });
    }));
  }
}

module.exports = { TypingIndicator };
