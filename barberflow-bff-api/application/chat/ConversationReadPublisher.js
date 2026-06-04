'use strict';

const { EVENT_TYPES } = require('../../config/realtime');
const { PresenceLink } = require('./PresenceLink');

class ConversationReadPublisher {
  #publishToChannelUseCase;
  #supabaseClient;

  constructor({ publishToChannelUseCase = null, supabaseClient = null }) {
    if (!publishToChannelUseCase && !supabaseClient) {
      throw new TypeError('ConversationReadPublisher requer publishToChannelUseCase ou supabaseClient.');
    }
    this.#publishToChannelUseCase = publishToChannelUseCase;
    this.#supabaseClient = supabaseClient;
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
    if (!this.#supabaseClient?.channel) return { ok: false, skipped: true };
    const channel = this.#supabaseClient.channel(channelName, {
      config: { private: true, broadcast: { self: false } },
    });
    await new Promise(resolve => {
      channel.subscribe(() => resolve());
      setTimeout(resolve, 1500).unref?.();
    });
    try {
      const response = await channel.send({
        type: 'broadcast',
        event: EVENT_TYPES.CHAT_CONVERSATION_READ,
        payload,
      });
      return { ok: response === 'ok' || response?.status === 'ok', response };
    } finally {
      await this.#supabaseClient.removeChannel?.(channel);
    }
  }
}

module.exports = { ConversationReadPublisher };
