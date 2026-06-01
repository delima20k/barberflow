'use strict';

class ListConversationsUseCase {
  #chatRepository;

  constructor({ chatRepository }) {
    if (!chatRepository) throw new TypeError('ListConversationsUseCase: chatRepository obrigatorio.');
    this.#chatRepository = chatRepository;
  }

  async execute({ userId }) {
    if (!userId) return { ok: false, error: 'userId obrigatorio.' };
    const items = await this.#chatRepository.listConversationsForUser(userId);
    return { ok: true, value: { items } };
  }
}

module.exports = { ListConversationsUseCase };
