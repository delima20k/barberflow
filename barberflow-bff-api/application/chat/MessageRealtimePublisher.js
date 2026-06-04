'use strict';

const { EVENT_TYPES } = require('../../config/realtime');
const { PresenceLink } = require('./PresenceLink');

class MessageRealtimePublisher {
  #publishToChannelUseCase;
  #broadcaster;

  constructor({ publishToChannelUseCase = null, broadcaster = null }) {
    if (!publishToChannelUseCase && !broadcaster) {
      throw new TypeError('MessageRealtimePublisher requer publishToChannelUseCase ou broadcaster.');
    }
    this.#publishToChannelUseCase = publishToChannelUseCase;
    this.#broadcaster = broadcaster;
  }

  async publish({ message, recipients = [], sender = null }) {
    if (!message || !Array.isArray(recipients) || recipients.length === 0) {
      return { ok: false, error: 'message e recipients obrigatorios.' };
    }
    const payload = { message: MessageRealtimePublisher.#withSender(message, sender) };
    const deliveries = recipients.map(recipientId => this.#publishRecipient(recipientId, payload));
    const results = await Promise.allSettled(deliveries);
    const ok = results.some(result => result.status === 'fulfilled' && result.value?.ok !== false);
    return { ok, results };
  }

  async #publishRecipient(recipientId, payload) {
    if (!recipientId) return { ok: false, skipped: true };
    const channel = PresenceLink.userChannel(recipientId);
    const results = await Promise.allSettled([
      this.#publishGateway(channel, payload),
      this.#publishSupabase(channel, payload),
    ]);
    return {
      ok: results.some(result => result.status === 'fulfilled' && result.value?.ok !== false),
      results,
    };
  }

  async #publishGateway(channel, payload) {
    if (!this.#publishToChannelUseCase) return { ok: false, skipped: true };
    return this.#publishToChannelUseCase.execute({
      channel,
      type: EVENT_TYPES.CHAT_MESSAGE_CREATED,
      payload,
    });
  }

  async #publishSupabase(channelName, payload) {
    if (!this.#broadcaster?.habilitado) return { ok: false, skipped: true };
    return this.#broadcaster.broadcast({
      topic: channelName,
      event: EVENT_TYPES.CHAT_MESSAGE_CREATED,
      payload,
      private: true,
    });
  }

  static #withSender(message, sender) {
    const messageJson = typeof message.toJSON === 'function' ? message.toJSON() : message;
    return {
      ...messageJson,
      sender: MessageRealtimePublisher.#senderDto(sender, messageJson.senderId),
    };
  }

  static #senderDto(sender, senderId) {
    return {
      id: sender?.id ?? senderId ?? null,
      name: sender?.name ?? null,
      avatarPath: sender?.avatarPath ?? null,
      role: sender?.role ?? null,
    };
  }
}

module.exports = { MessageRealtimePublisher };
