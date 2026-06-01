'use strict';

const crypto = require('node:crypto');
const { ChatRepository } = require('../../domain/chat/ports/ChatRepository');
const { Conversation } = require('../../domain/chat/entities/Conversation');
const { Message } = require('../../domain/chat/entities/Message');
const { MuteRule } = require('../../domain/chat/policies/MuteRule');

class InMemoryChatRepository extends ChatRepository {
  #clock;
  #conversations = new Map();
  #messages = new Map();
  #clientKeys = new Map();
  #blocks = new Set();
  #muteRules = [];

  constructor({ clock = { now: () => new Date() } } = {}) {
    super();
    this.#clock = clock;
  }

  seedConversation({ id, participantIds }) {
    this.#conversations.set(id, Conversation.restore({
      id,
      participants: participantIds.map(userId => ({ userId })),
    }));
  }

  seedBlock(leftUserId, rightUserId) {
    this.#blocks.add(InMemoryChatRepository.#blockKey(leftUserId, rightUserId));
  }

  seedMute(rule) {
    this.#muteRules.push(rule instanceof MuteRule ? rule : MuteRule.restore(rule));
  }

  async findConversation(conversationId) {
    return this.#conversations.get(conversationId) ?? null;
  }

  async findByClientMessageId(senderId, clientMessageId) {
    const id = this.#clientKeys.get(`${senderId}:${clientMessageId}`);
    return id ? this.#messages.get(id) : null;
  }

  async saveMessage(message) {
    const current = await this.findByClientMessageId(message.senderId, message.clientMessageId);
    if (current) return current;
    const stored = Message.restore({
      ...message.toJSON(),
      id: message.id ?? crypto.randomUUID(),
      createdAt: message.createdAt ?? this.#clock.now(),
    });
    this.#messages.set(stored.id, stored);
    this.#clientKeys.set(`${stored.senderId}:${stored.clientMessageId}`, stored.id);
    return stored;
  }

  async findDeliveryContext(messageId) {
    const message = this.#messages.get(messageId);
    const conversation = message ? await this.findConversation(message.conversationId) : null;
    if (!message || !conversation) return null;
    return {
      message,
      recipients: conversation.recipientIds(message.senderId),
      muteRules: this.#muteRules.filter(rule => rule.conversationId === message.conversationId),
    };
  }

  async listMessagesReverse({ conversationId, cursor = null, limit = 30 }) {
    const ordered = [...this.#messages.values()]
      .filter(message => message.conversationId === conversationId)
      .sort((left, right) => right.sortKey.localeCompare(left.sortKey));
    const start = cursor ? ordered.findIndex(message => message.sortKey === cursor) + 1 : 0;
    const items = ordered.slice(Math.max(0, start), Math.max(0, start) + limit);
    return {
      items: items.map(message => message.toJSON()),
      nextCursor: items.length === limit ? items[items.length - 1].sortKey : null,
    };
  }

  async countRecentPairMessages(senderId, recipientIds, windowSeconds) {
    const min = this.#clock.now().getTime() - windowSeconds * 1000;
    return [...this.#messages.values()].filter(message => {
      if (message.senderId !== senderId || message.createdAt.getTime() < min) return false;
      const conversation = this.#conversations.get(message.conversationId);
      return recipientIds.some(id => conversation?.recipient(id)?.isActive);
    }).length;
  }

  async countRecentDuplicateBodies(conversationId, senderId, body, windowSeconds) {
    const min = this.#clock.now().getTime() - windowSeconds * 1000;
    return [...this.#messages.values()].filter(message => (
      message.conversationId === conversationId
      && message.senderId === senderId
      && message.body === body
      && message.createdAt.getTime() >= min
    )).length;
  }

  async hasBidirectionalBlock(leftUserId, rightUserId) {
    return this.#blocks.has(InMemoryChatRepository.#blockKey(leftUserId, rightUserId));
  }

  async softDeleteMessage(messageId, senderId, retentionUntil) {
    const message = this.#messages.get(messageId);
    if (!message || message.senderId !== senderId) return null;
    const deleted = message.softDelete({ deletedAt: this.#clock.now(), retentionUntil });
    this.#messages.set(deleted.id, deleted);
    return deleted;
  }

  static #blockKey(left, right) {
    return [left, right].sort().join(':');
  }
}

module.exports = { InMemoryChatRepository };
