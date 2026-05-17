'use strict';

// =============================================================
// ComunicacaoRepository.js — Repositório de comunicação.
// Camada: infra
//
// Tabelas: notifications.
// Sem lógica de negócio — apenas acesso e persistência.
//
// Mensagens diretas foram migradas para P2P com E2E encryption.
// Ver: shared/js/P2PMessageConnectionService.js
// =============================================================

const BaseRepository  = require('../infra/BaseRepository');

class ComunicacaoRepository extends BaseRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('ComunicacaoRepository');
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
    this._validarUuid('userId', userId);

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
    this._validarUuid('notificationId', notificationId);
    this._validarUuid('userId', userId);

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

}

module.exports = ComunicacaoRepository;
