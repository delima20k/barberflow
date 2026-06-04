'use strict';

const { EVENT_TYPES } = require('../../config/realtime');
const { PresenceLink } = require('./PresenceLink');

class ConversationReadPublisher {
  #publishToChannelUseCase;
  #broadcaster;

  constructor({ publishToChannelUseCase = null, broadcaster = null }) {
    if (!publishToChannelUseCase && !broadcaster) {
      throw new TypeError('ConversationReadPublisher requer publishToChannelUseCase ou broadcaster.');
    }
    this.#publishToChannelUseCase = publishToChannelUseCase;
    this.#broadcaster = broadcaster;
  }

  async publish({ conversationId, userId, lastReadMessageId = null, unreadCount = 0 }) {
    if (!conversationId || !userId) return { ok: false, error: 'conversationId e userId obrigatorios.' };
    const channel = PresenceLink.userChannel(userId);
    const payload = { conversationId, userId, lastReadMessageId, unreadCount };
    const results = await Promise.allSettled([
      this.#publishGateway(channel, payload),
      this.#publishSupabase(channel, payload),
    ]);
    const ok = results.some(result => result.status === 'fulfilled' && result.value?.ok !== false);
    return { ok, results };
  }

  async #publishGateway(channel, payload) {
    if (!this.#publishToChannelUseCase) return { ok: false, skipped: true };
    return this.#publishToChannelUseCase.execute({
      channel,
      type: EVENT_TYPES.CHAT_CONVERSATION_READ,
      payload,
    });
  }

  async #publishSupabase(channelName, payload) {
    if (!this.#broadcaster?.habilitado) return { ok: false, skipped: true };
    return this.#broadcaster.broadcast({
      topic: channelName,
      event: EVENT_TYPES.CHAT_CONVERSATION_READ,
      payload,
      private: true,
    });
  }
}

module.exports = { ConversationReadPublisher };
