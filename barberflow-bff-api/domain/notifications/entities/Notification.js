'use strict';

const { randomUUID } = require('node:crypto');
const { Result } = require('../../shared/Result');

const VALID_PRIORITIES = new Set(['high', 'default', 'low']);
const VALID_CHANNELS = new Set(['push', 'email', 'in_app', 'sms']);

class Notification {
  #props;

  constructor(props) {
    this.#props = Object.freeze({
      id: props.id ?? randomUUID(),
      userId: props.userId,
      templateId: props.templateId,
      category: props.category,
      priority: props.priority ?? 'default',
      channels: Object.freeze([...(props.channels ?? [])]),
      dedupeKey: props.dedupeKey ?? null,
      digestKey: props.digestKey ?? null,
      data: Object.freeze({ ...(props.data ?? {}) }),
      locale: props.locale ?? 'pt-BR',
      status: props.status ?? 'pending',
      createdAt: props.createdAt instanceof Date ? props.createdAt : new Date(props.createdAt ?? Date.now()),
    });
    Object.freeze(this);
  }

  static create(props = {}) {
    if (!props.userId) return Result.fail('Notification.userId obrigatorio');
    if (!props.templateId) return Result.fail('Notification.templateId obrigatorio');
    if (!props.category) return Result.fail('Notification.category obrigatorio');
    if (!VALID_PRIORITIES.has(props.priority ?? 'default')) return Result.fail('Notification.priority invalida');
    const channels = props.channels ?? [];
    if (!Array.isArray(channels) || channels.length === 0) return Result.fail('Notification.channels obrigatorio');
    const invalid = channels.find(channel => !VALID_CHANNELS.has(channel));
    if (invalid) return Result.fail(`Notification.channel invalido: ${invalid}`);
    return Result.ok(new Notification(props));
  }

  get id() { return this.#props.id; }
  get userId() { return this.#props.userId; }
  get templateId() { return this.#props.templateId; }
  get category() { return this.#props.category; }
  get priority() { return this.#props.priority; }
  get channels() { return this.#props.channels; }
  get dedupeKey() { return this.#props.dedupeKey; }
  get digestKey() { return this.#props.digestKey; }
  get data() { return this.#props.data; }
  get locale() { return this.#props.locale; }
  get status() { return this.#props.status; }
  get createdAt() { return this.#props.createdAt; }

  isHighPriority() { return this.priority === 'high'; }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      templateId: this.templateId,
      category: this.category,
      priority: this.priority,
      channels: [...this.channels],
      dedupeKey: this.dedupeKey,
      digestKey: this.digestKey,
      data: { ...this.data },
      locale: this.locale,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

module.exports = { Notification };
