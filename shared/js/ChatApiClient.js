'use strict';

// =============================================================
// ChatApiClient.js — Camada: infra
//
// Cliente HTTP para operações de mensagens da BFF.
// Superset de BffApiService.chat — adiciona enviarMensagem e deletarMensagem.
//
// Dependências: BffApiService.js
// =============================================================

class ChatApiClient {

  /**
   * Lista mensagens de uma conversa com cursor paginado.
   * @param {string} conversationId
   * @param {{ cursor?: string|null, limit?: number }} opts
   * @returns {Promise<{ data: { items: object[], nextCursor: string|null }, error: Error|null }>}
   */
  static async listarMensagens(conversationId, { cursor = null, limit = 30 } = {}) {
    const params = { limit: String(limit) };
    if (cursor) params.cursor = cursor;
    return BffApiService.get(
      `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      params
    );
  }

  /**
   * Envia uma mensagem para a conversa (idempotente via clientMessageId).
   * @param {string} conversationId
   * @param {{ body: string, clientMessageId: string }} payload
   * @returns {Promise<{ data: object, error: Error|null }>}
   */
  static async enviarMensagem(conversationId, { body, clientMessageId }) {
    return BffApiService.post(
      `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      { body, clientMessageId }
    );
  }

  /**
   * Marca uma conversa como lida para o usuário autenticado.
   * @param {string} conversationId
   * @returns {Promise<{ data: { conversationId: string, lastReadMessageId: string|null, unreadCount: number }, error: Error|null }>}
   */
  static async marcarConversaComoLida(conversationId) {
    return BffApiService.patch(
      `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/read`,
      {}
    );
  }

  /**
   * Soft-delete de uma mensagem (somente o remetente pode deletar).
   * @param {string} messageId
   * @returns {Promise<{ data: null, error: Error|null }>}
   */
  static async deletarMensagem(messageId) {
    return BffApiService.delete(
      `/api/v1/chat/messages/${encodeURIComponent(messageId)}`
    );
  }
}
