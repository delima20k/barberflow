'use strict';

class GetOrCreateConversationUseCase {
  #chatRepository;
  #blockPolicy;

  constructor({ chatRepository, blockPolicy }) {
    if (!chatRepository) throw new TypeError('GetOrCreateConversationUseCase: chatRepository obrigatorio.');
    if (!blockPolicy)    throw new TypeError('GetOrCreateConversationUseCase: blockPolicy obrigatorio.');
    this.#chatRepository = chatRepository;
    this.#blockPolicy    = blockPolicy;
  }

  async execute({ requesterId, targetUserId }) {
    if (!requesterId || !targetUserId) return { ok: false, error: 'requesterId e targetUserId obrigatorios.' };
    if (requesterId === targetUserId)   return { ok: false, error: 'Nao e possivel iniciar conversa consigo mesmo.' };

    const bloqueado = await this.#blockPolicy.canExchange(requesterId, targetUserId).then(r => !r).catch(() => true);
    if (bloqueado) return { ok: false, error: 'Comunicacao bloqueada entre os usuarios.' };

    const conversation = await this.#chatRepository.findOrCreateDirect(requesterId, targetUserId);
    if (!conversation) return { ok: false, error: 'Falha ao criar conversa.' };

    return { ok: true, value: { id: conversation.id, type: conversation.type ?? 'direct' } };
  }
}

module.exports = { GetOrCreateConversationUseCase };
