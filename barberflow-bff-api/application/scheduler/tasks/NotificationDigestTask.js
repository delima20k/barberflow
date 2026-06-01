'use strict';

class NotificationDigestTask {
  #repository;
  #queueService;

  constructor({ notificationRepository = null, queueService = null } = {}) {
    this.#repository = notificationRepository;
    this.#queueService = queueService;
  }

  async execute() {
    if (this.#repository?.flushDueDigests) {
      await this.#repository.flushDueDigests({ queueService: this.#queueService });
    }
  }
}

module.exports = { NotificationDigestTask };
