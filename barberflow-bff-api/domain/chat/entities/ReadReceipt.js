'use strict';

class ReadReceipt {
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static restore({ messageId, userId, readAt = new Date() } = {}) {
    if (!messageId || !userId) throw new TypeError('ReadReceipt requer messageId e userId.');
    const parsed = readAt instanceof Date ? readAt : new Date(readAt);
    if (Number.isNaN(parsed.getTime())) throw new TypeError('ReadReceipt.readAt invalido.');
    return new ReadReceipt({ messageId, userId, readAt: parsed });
  }

  get messageId() { return this.#props.messageId; }
  get userId() { return this.#props.userId; }
  get readAt() { return this.#props.readAt; }

  toJSON() {
    return { messageId: this.messageId, userId: this.userId, readAt: this.readAt.toISOString() };
  }
}

module.exports = { ReadReceipt };
