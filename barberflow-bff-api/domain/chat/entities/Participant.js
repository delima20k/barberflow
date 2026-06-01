'use strict';

class Participant {
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static restore({ conversationId, userId, joinedAt = new Date(), leftAt = null } = {}) {
    if (!conversationId || !userId) throw new TypeError('Participant requer conversationId e userId.');
    return new Participant({
      conversationId,
      userId,
      joinedAt: Participant.#date(joinedAt, 'joinedAt'),
      leftAt: leftAt ? Participant.#date(leftAt, 'leftAt') : null,
    });
  }

  static #date(value, name) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError(`Participant.${name} invalido.`);
    return date;
  }

  get conversationId() { return this.#props.conversationId; }
  get userId() { return this.#props.userId; }
  get joinedAt() { return this.#props.joinedAt; }
  get leftAt() { return this.#props.leftAt; }
  get isActive() { return !this.leftAt; }

  toJSON() {
    return {
      conversationId: this.conversationId,
      userId: this.userId,
      joinedAt: this.joinedAt.toISOString(),
      leftAt: this.leftAt?.toISOString() ?? null,
    };
  }
}

module.exports = { Participant };
