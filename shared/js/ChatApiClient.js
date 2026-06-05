'use strict';

// =============================================================
// ChatApiClient.js — Camada: infra
//
// Cliente HTTP para operações de mensagens da BFF.
// Superset de BffApiService.chat — adiciona enviarMensagem,
// deletarMensagem e endpoints de chave pública E2E.
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
   * Envia mensagem para a conversa (idempotente via clientMessageId).
   * Aceita encrypted_payload (E2E) ou body (legado/fallback).
   * Nunca envia os dois ao mesmo tempo para uma mensagem nova.
   *
   * @param {string} conversationId
   * @param {{ encrypted_payload?: object, body?: string, clientMessageId: string }} payload
   * @returns {Promise<{ data: object, error: Error|null }>}
   */
  static async enviarMensagem(conversationId, { encrypted_payload, body, clientMessageId }) {
    return BffApiService.post(
      `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      { encrypted_payload, body, clientMessageId }
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

  /**
   * Registra ou atualiza a chave pública ECDH P-256 do usuário autenticado.
   * Idempotente: o BFF faz upsert.
   *
   * @param {string} publicKeyB64 — chave pública em base64 SPKI
   * @returns {Promise<{ data: object, error: Error|null }>}
   */
  static async registrarChavePublica(publicKeyB64) {
    return BffApiService.post('/api/v1/chat/me/public-key', { publicKey: publicKeyB64 });
  }

  /**
   * Obtém a chave pública ECDH P-256 de outro usuário.
   *
   * @param {string} userId
   * @returns {Promise<{ data: { publicKey: string }, error: Error|null }>}
   */
  static async obterChavePublicaUsuario(userId) {
    return BffApiService.get(`/api/v1/chat/users/${encodeURIComponent(userId)}/public-key`);
  }
}
