'use strict';

class ChatMessagePurgeTask {
  #useCase;

  constructor({ purgeExpiredChatMessagesUseCase }) {
    if (!purgeExpiredChatMessagesUseCase) {
      throw new TypeError('ChatMessagePurgeTask requer purgeExpiredChatMessagesUseCase.');
    }
    this.#useCase = purgeExpiredChatMessagesUseCase;
  }

  async execute() {
    const result = await this.#useCase.execute();
    if (result.isFail()) throw new Error(result.getError());
    const { deletedCount, olderThanDays } = result.getValue();
    // Log apenas metadados — nunca conteúdo das mensagens
    /* eslint-disable no-console */
    console.info(`[ChatMessagePurgeTask] ${deletedCount} mensagem(ns) > ${olderThanDays} dias removida(s).`);
  }
}

module.exports = { ChatMessagePurgeTask };
