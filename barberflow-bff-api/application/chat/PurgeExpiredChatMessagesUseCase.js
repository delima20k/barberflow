'use strict';

const { Result } = require('../../domain/shared/Result');

class PurgeExpiredChatMessagesUseCase {
  #chatRepository;
  #olderThanDays;

  constructor({ chatRepository, olderThanDays = 7 }) {
    if (!chatRepository) throw new TypeError('PurgeExpiredChatMessagesUseCase requer chatRepository.');
    if (typeof olderThanDays !== 'number' || olderThanDays < 1 || olderThanDays > 365) {
      throw new RangeError('olderThanDays deve estar entre 1 e 365.');
    }
    this.#chatRepository = chatRepository;
    this.#olderThanDays  = olderThanDays;
  }

  async execute() {
    const deletedCount = await this.#chatRepository.purgeExpiredMessages(this.#olderThanDays);
    return Result.ok({ deletedCount, olderThanDays: this.#olderThanDays });
  }
}

module.exports = { PurgeExpiredChatMessagesUseCase };
