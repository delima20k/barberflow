'use strict';

class MarkConversationReadUseCase {
  #chatRepository;

  constructor({ chatRepository }) {
    if (!chatRepository) throw new TypeError('MarkConversationReadUseCase: chatRepository obrigatorio.');
    this.#chatRepository = chatRepository;
  }

  async execute({ conversationId, userId }) {
    if (!conversationId) return { ok: false, error: 'conversationId obrigatorio.' };
    if (!userId) return { ok: false, error: 'userId obrigatorio.' };

    const result = await this.#chatRepository.markConversationRead(conversationId, userId);
    if (!result) return { ok: false, error: 'Conversa indisponivel para o usuario.' };

    return { ok: true, value: result };
  }
}

module.exports = { MarkConversationReadUseCase };
