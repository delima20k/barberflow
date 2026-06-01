'use strict';

class MuteRule {
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static restore({ conversationId, userId, mutedUntil = null } = {}) {
    if (!conversationId || !userId) throw new TypeError('MuteRule requer conversationId e userId.');
    const until = mutedUntil ? new Date(mutedUntil) : null;
    if (until && Number.isNaN(until.getTime())) throw new TypeError('MuteRule.mutedUntil invalido.');
    return new MuteRule({ conversationId, userId, mutedUntil: until });
  }

  get conversationId() { return this.#props.conversationId; }
  get userId() { return this.#props.userId; }
  get mutedUntil() { return this.#props.mutedUntil; }

  shouldSkipPush(now = new Date()) {
    return !!this.mutedUntil && this.mutedUntil.getTime() > now.getTime();
  }
}

module.exports = { MuteRule };
