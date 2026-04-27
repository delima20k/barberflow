'use strict';

// =============================================================
// ComunicacaoRepository.js — Repositório de comunicação.
// Camada: infra
//
// Tabelas: notifications, direct_messages.
// Sem lógica de negócio — apenas acesso e persistência.
// =============================================================

const InputValidator  = require('../infra/InputValidator');
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

  // ── Mensagens Diretas ────────────────────────────────────

  /**
   * Retorna a conversa entre dois usuários.
   *
   * Usa duas queries paralelas (uma por direção) em vez de .or() com
   * interpolação de string. Garante zero concatenação em filtros de query.
   *
   * @param {string} userId
   * @param {string} contatoId
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async getConversa(userId, contatoId, limit = 50) {
    this._validarUuid('userId', userId);
    this._validarUuid('contatoId', contatoId);

    const SELECT = 'id, sender_id, receiver_id, content, is_read, created_at';

    const [r1, r2] = await Promise.all([
      this.#supabase
        .from('direct_messages')
        .select(SELECT)
        .eq('sender_id', userId)
        .eq('receiver_id', contatoId)
        .order('created_at', { ascending: true })
        .limit(limit),
      this.#supabase
        .from('direct_messages')
        .select(SELECT)
        .eq('sender_id', contatoId)
        .eq('receiver_id', userId)
        .order('created_at', { ascending: true })
        .limit(limit),
    ]);

    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;

    return [...(r1.data ?? []), ...(r2.data ?? [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(0, limit);
  }

  /**
   * Envia uma mensagem direta.
   * @param {string} remetente
   * @param {string} destinatario
   * @param {string} conteudo
   * @returns {Promise<object>}
   */
  async enviarMensagem(remetente, destinatario, conteudo) {
    this._validarUuid('remetente', remetente);
    this._validarUuid('destinatario', destinatario);

    const rConteudo = InputValidator.textoLivre(conteudo, 2000, true);
    if (!rConteudo.ok) throw new TypeError(`[ComunicacaoRepository] conteudo: ${rConteudo.msg}`);

    const { data, error } = await this.#supabase
      .from('direct_messages')
      .insert({
        sender_id:   remetente,
        receiver_id: destinatario,
        content:     rConteudo.valor,
        is_read:     false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = ComunicacaoRepository;
