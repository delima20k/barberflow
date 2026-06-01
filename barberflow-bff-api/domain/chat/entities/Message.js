'use strict';

const crypto = require('node:crypto');
const { Result } = require('../../shared/Result');
const { Attachment } = require('./Attachment');
const { MessageStatus } = require('./MessageStatus');

class Message {
  static BODY_MAX_LENGTH = 4_000;
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static create({
    conversationId,
    senderId,
    clientMessageId,
    body = '',
    attachments = [],
    createdAt = new Date(),
    id = crypto.randomUUID(),
  } = {}) {
    if (!conversationId || !senderId || !clientMessageId) {
      return Result.fail('Message requer conversationId, senderId e clientMessageId.');
    }
    if (typeof body !== 'string' || body.length > Message.BODY_MAX_LENGTH) {
      return Result.fail('Message.body invalido.');
    }
    if (!body.trim() && attachments.length === 0) {
      return Result.fail('Message requer texto ou anexo.');
    }
    return Result.ok(Message.restore({
      id,
      conversationId,
      senderId,
      clientMessageId,
      body,
      attachments,
      createdAt,
    }));
  }

  static restore(props = {}) {
    if (!props.id || !props.conversationId || !props.senderId || !props.clientMessageId) {
      throw new TypeError('Message.restore requer id, conversationId, senderId e clientMessageId.');
    }
    const createdAt = Message.#date(props.createdAt ?? new Date(), 'createdAt');
    const deletedAt = props.deletedAt ? Message.#date(props.deletedAt, 'deletedAt') : null;
    const retentionUntil = props.retentionUntil ? Message.#date(props.retentionUntil, 'retentionUntil') : null;
    return new Message({
      id: props.id,
      conversationId: props.conversationId,
      senderId: props.senderId,
      clientMessageId: props.clientMessageId,
      body: deletedAt ? '' : String(props.body ?? ''),
      attachments: Object.freeze((props.attachments ?? []).map(item => item instanceof Attachment ? item : Attachment.restore(item))),
      createdAt,
      deletedAt,
      retentionUntil,
      status: props.status instanceof MessageStatus ? props.status : MessageStatus.restore(props.status),
    });
  }

  static #date(value, name) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError(`Message.${name} invalido.`);
    return date;
  }

  get id() { return this.#props.id; }
  get conversationId() { return this.#props.conversationId; }
  get senderId() { return this.#props.senderId; }
  get clientMessageId() { return this.#props.clientMessageId; }
  get body() { return this.#props.body; }
  get attachments() { return this.#props.attachments; }
  get createdAt() { return this.#props.createdAt; }
  get deletedAt() { return this.#props.deletedAt; }
  get retentionUntil() { return this.#props.retentionUntil; }
  get status() { return this.#props.status; }
  get sortKey() { return `${this.createdAt.toISOString()}:${this.id}`; }

  softDelete({ deletedAt = new Date(), retentionUntil } = {}) {
    return Message.restore({
      ...this.toJSON(),
      deletedAt,
      retentionUntil,
      attachments: [],
    });
  }

  toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      clientMessageId: this.clientMessageId,
      body: this.body,
      attachments: this.attachments.map(attachment => attachment.toJSON()),
      createdAt: this.createdAt.toISOString(),
      deletedAt: this.deletedAt?.toISOString() ?? null,
      retentionUntil: this.retentionUntil?.toISOString() ?? null,
      status: this.status.toJSON(),
      sortKey: this.sortKey,
    };
  }
}

module.exports = { Message };
