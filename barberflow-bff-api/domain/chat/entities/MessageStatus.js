'use strict';

class MessageStatus {
  static VALUES = new Set(['saved', 'published', 'delivered', 'read', 'failed']);
  #value;
  #at;

  constructor(value, at) {
    this.#value = value;
    this.#at = at;
    Object.freeze(this);
  }

  static restore({ value = 'saved', at = new Date() } = {}) {
    if (!MessageStatus.VALUES.has(value)) throw new TypeError('MessageStatus invalido.');
    const date = at instanceof Date ? at : new Date(at);
    if (Number.isNaN(date.getTime())) throw new TypeError('MessageStatus.at invalido.');
    return new MessageStatus(value, date);
  }

  get value() { return this.#value; }
  get at() { return this.#at; }

  toJSON() {
    return { value: this.value, at: this.at.toISOString() };
  }
}

module.exports = { MessageStatus };
