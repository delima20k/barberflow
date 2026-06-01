'use strict';

const { Result } = require('../../domain/shared/Result');
const { ChatPolicyCatalog } = require('../../config/chat');

class SoftDeleteMessageUseCase {
  #chatRepository;
  #policy;
  #clock;

  constructor({ chatRepository, policy = new ChatPolicyCatalog(), clock = { now: () => new Date() } }) {
    if (!chatRepository) throw new TypeError('SoftDeleteMessageUseCase.chatRepository obrigatorio.');
    this.#chatRepository = chatRepository;
    this.#policy = policy;
    this.#clock = clock;
  }

  async execute({ messageId, senderId } = {}) {
    if (!messageId || !senderId) return Result.fail('messageId e senderId obrigatorios.');
    const deleted = await this.#chatRepository.softDeleteMessage(
      messageId,
      senderId,
      this.#policy.retentionUntil(this.#clock.now()),
    );
    return deleted ? Result.ok(deleted.toJSON()) : Result.fail('Mensagem nao encontrada.');
  }
}

module.exports = { SoftDeleteMessageUseCase };
