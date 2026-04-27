'use strict';

// =============================================================
// ComunicacaoRepository.js — Repositório de comunicação.
// Camada: infra
//
// Tabelas: notifications, direct_messages.
// Sem lógica de negócio — apenas acesso e persistência.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class ComunicacaoRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    this.#supabase = supabase;
  }

  // ── Notificações ──────────────────────────────────────────

  /**
   * Retorna as notificações de um usuário.
   * @param {string} userId
   * @param {number} [limit=30]
   * @returns {Promise<object[]>}
   */
  async getNotificacoes(userId, limit = 30) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ComunicacaoRepository] userId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('notifications')
      .select('id, type, title, body, is_read, reference_id, reference_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Marca uma notificação como lida.
   * @param {string} notificationId
   * @param {string} userId — verifica ownership
   * @returns {Promise<object>}
   */
  async marcarLida(notificationId, userId) {
    const rNot = InputValidator.uuid(notificationId);
    const rUsr = InputValidator.uuid(userId);
    if (!rNot.ok) throw new TypeError(`[ComunicacaoRepository] notificationId: ${rNot.msg}`);
    if (!rUsr.ok) throw new TypeError(`[ComunicacaoRepository] userId: ${rUsr.msg}`);

    const { data, error } = await this.#supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ── Mensagens Diretas ────────────────────────────────────

  /**
   * Retorna a conversa entre dois usuários.
   * @param {string} userId
   * @param {string} contatoId
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async getConversa(userId, contatoId, limit = 50) {
    const rUsr = InputValidator.uuid(userId);
    const rCon = InputValidator.uuid(contatoId);
    if (!rUsr.ok) throw new TypeError(`[ComunicacaoRepository] userId: ${rUsr.msg}`);
    if (!rCon.ok) throw new TypeError(`[ComunicacaoRepository] contatoId: ${rCon.msg}`);

    const { data, error } = await this.#supabase
      .from('direct_messages')
      .select('id, sender_id, receiver_id, content, is_read, created_at')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${contatoId}),` +
        `and(sender_id.eq.${contatoId},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Envia uma mensagem direta.
   * @param {string} remetente
   * @param {string} destinatario
   * @param {string} conteudo
   * @returns {Promise<object>}
   */
  async enviarMensagem(remetente, destinatario, conteudo) {
    const { data, error } = await this.#supabase
      .from('direct_messages')
      .insert({
        sender_id:   remetente,
        receiver_id: destinatario,
        content:     conteudo,
        is_read:     false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = ComunicacaoRepository;
