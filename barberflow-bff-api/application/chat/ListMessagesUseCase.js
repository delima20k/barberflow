'use strict';

const { Result } = require('../../domain/shared/Result');
const { ConversationAccessPolicy } = require('../../domain/chat/policies/ConversationAccessPolicy');

class ListMessagesUseCase {
  #chatRepository;

  constructor({ chatRepository }) {
    if (!chatRepository) throw new TypeError('ListMessagesUseCase.chatRepository obrigatorio.');
    this.#chatRepository = chatRepository;
  }

  async execute({ conversationId, userId, cursor = null, limit = 30 } = {}) {
    const conversation = await this.#chatRepository.findConversation(conversationId);
    if (!ConversationAccessPolicy.canRead(conversation, userId)) return Result.fail('Conversa indisponivel.');
    const page = await this.#chatRepository.listMessagesReverse({
      conversationId,
      cursor,
      limit: Math.max(1, Math.min(Number(limit) || 30, 100)),
    });
    return Result.ok(page);
  }
}

module.exports = { ListMessagesUseCase };
