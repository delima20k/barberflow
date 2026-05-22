'use strict';

class PresenceLink {
  #presenceService;

  constructor({ presenceService }) {
    if (!presenceService) throw new TypeError('PresenceLink.presenceService obrigatorio.');
    this.#presenceService = presenceService;
  }

  static userChannel(userId) {
    if (!userId) throw new TypeError('PresenceLink.userId obrigatorio.');
    return `chat.${userId}`;
  }

  isOnline(userId) {
    return this.#presenceService.isPresent(PresenceLink.userChannel(userId), userId);
  }
}

module.exports = { PresenceLink };
