'use strict';

// =============================================================
// ConversationRepository.js — Camada: infra
//
// Cliente HTTP para os endpoints de conversas da BFF.
// Não contém regra de negócio.
//
// Dependências: BffApiService.js
// =============================================================

class ConversationRepository {

  /**
   * Lista todas as conversas ativas do usuário logado.
   * @returns {Promise<{ data: { items: object[] }, error: Error|null }>}
   *   items[]: { id, type, createdAt, lastMessage, unreadCount, otherParticipantIds }
   */
  static async listar() {
    return BffApiService.get('/api/v1/chat/conversations');
  }

  /**
   * Encontra ou cria uma conversa direta entre o usuário logado e targetUserId.
   * @param {string} targetUserId — UUID do outro participante
   * @returns {Promise<{ data: { id: string, type: string }, error: Error|null }>}
   */
  static async buscarOuCriar(targetUserId) {
    return BffApiService.post('/api/v1/chat/conversations', { targetUserId });
  }
}
