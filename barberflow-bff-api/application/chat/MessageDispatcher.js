'use strict';

const { EVENT_TYPES } = require('../../config/realtime');
const { PresenceLink } = require('./PresenceLink');

class MessageDispatcher {
  #publishToChannelUseCase;
  #presenceLink;
  #pushGateway;
  #blockPolicy;
  #clock;

  constructor({
    publishToChannelUseCase,
    presenceLink,
    pushGateway,
    blockPolicy,
    clock = { now: () => new Date() },
  }) {
    if (!publishToChannelUseCase) throw new TypeError('MessageDispatcher.publishToChannelUseCase obrigatorio.');
    if (!presenceLink) throw new TypeError('MessageDispatcher.presenceLink obrigatorio.');
    if (!pushGateway) throw new TypeError('MessageDispatcher.pushGateway obrigatorio.');
    if (!blockPolicy) throw new TypeError('MessageDispatcher.blockPolicy obrigatorio.');
    this.#publishToChannelUseCase = publishToChannelUseCase;
    this.#presenceLink = presenceLink;
    this.#pushGateway = pushGateway;
    this.#blockPolicy = blockPolicy;
    this.#clock = clock;
  }

  async dispatch({ message, recipients = [], muteRules = [], sender = null }) {
    if (!message) throw new TypeError('MessageDispatcher.message obrigatoria.');
    const muted = new Map(muteRules.map(rule => [rule.userId, rule]));
    const deliveries = recipients.map(recipientId => this.#dispatchOne(message, recipientId, muted.get(recipientId), sender));
    await Promise.all(deliveries);
  }

  async #dispatchOne(message, recipientId, muteRule, sender) {
    if (!(await this.#blockPolicy.canExchange(message.senderId, recipientId))) return;
    await this.#publishToChannelUseCase.execute({
      channel: PresenceLink.userChannel(recipientId),
      type: EVENT_TYPES.CHAT_MESSAGE_CREATED,
      payload: { message: MessageDispatcher.#withSender(message.toJSON(), sender) },
    });
    if (this.#presenceLink.isOnline(recipientId)) return;
    if (muteRule?.shouldSkipPush(this.#clock.now())) return;
    await this.#pushGateway.notifyMessage({
      userId: recipientId,
      conversationId: message.conversationId,
      messageId: message.id,
      senderId: message.senderId,
    });
  }

  static #withSender(messageJson, sender) {
    return {
      ...messageJson,
      sender: MessageDispatcher.#senderDto(sender, messageJson.senderId),
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

module.exports = { MessageDispatcher };
