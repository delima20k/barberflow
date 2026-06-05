'use strict';

class MarkConversationReadUseCase {
  #chatRepository;
  #readPublisher;

  constructor({ chatRepository, readPublisher = null }) {
    if (!chatRepository) throw new TypeError('MarkConversationReadUseCase: chatRepository obrigatorio.');
    this.#chatRepository = chatRepository;
    this.#readPublisher = readPublisher;
  }

  async execute({ conversationId, userId }) {
    if (!conversationId) return { ok: false, error: 'conversationId obrigatorio.' };
    if (!userId) return { ok: false, error: 'userId obrigatorio.' };

    const result = await this.#chatRepository.markConversationRead(conversationId, userId);
    if (!result) return { ok: false, error: 'Conversa indisponivel para o usuario.' };

    if (this.#readPublisher) {
      try {
        // 1. Notifica o leitor → limpa badge no dispositivo de quem leu
        await this.#readPublisher.publish({
          conversationId: result.conversationId,
          userId,
          lastReadMessageId: result.lastReadMessageId ?? null,
          unreadCount: result.unreadCount ?? 0,
        });

        // 2. Notifica o(s) remetente(s) → atualiza ✓✓ no dispositivo de quem enviou
        const conversation = await this.#chatRepository.findConversation(conversationId);
        const senderIds = conversation?.recipientIds(userId) ?? [];
        await Promise.allSettled(senderIds.map(senderId =>
          this.#readPublisher.publish({
            conversationId: result.conversationId,
            userId: senderId,
            lastReadMessageId: result.lastReadMessageId ?? null,
            unreadCount: 0,
            readByUserId: userId,
          })
        ));
      } catch (_) {
        // Leitura persistida no banco e resposta HTTP nao devem falhar por fanout realtime.
      }
    }

    return { ok: true, value: result };
  }
}

module.exports = { MarkConversationReadUseCase };
