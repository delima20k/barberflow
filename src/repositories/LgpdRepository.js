'use strict';

// =============================================================
// LgpdRepository.js — Repositório de dados LGPD.
// Camada: infra
//
// Tabelas: legal_consents, data_deletion_requests, data_access_log.
// Sem lógica de negócio — apenas acesso e persistência.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class LgpdRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    this.#supabase = supabase;
  }

  /**
   * Verifica se o usuário aceitou os termos.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async verificarAceite(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[LgpdRepository] userId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('legal_consents')
      .select('id, user_id, version, accepted_at')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }

  /**
   * Registra aceite de termos.
   * @param {string} userId
   * @param {{ version: string, ip?: string, user_agent?: string }} dados
   * @returns {Promise<object>}
   */
  async registrarAceite(userId, dados) {
    const { data, error } = await this.#supabase
      .from('legal_consents')
      .insert({
        user_id:    userId,
        version:    dados.version,
        ip_address: dados.ip        ?? null,
        user_agent: dados.user_agent ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Registra solicitação de exclusão de dados (LGPD Art. 18, VI).
   * @param {string} userId
   * @param {string} motivo
   * @returns {Promise<object>}
   */
  async solicitarExclusao(userId, motivo) {
    const { data, error } = await this.#supabase
      .from('data_deletion_requests')
      .insert({
        user_id: userId,
        reason:  motivo,
        status:  'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Registra log de acesso a dados (LGPD Art. 37).
   * @param {{ accessed_by: string, target_user_id: string, data_type: string, purpose: string }} dados
   * @returns {Promise<object>}
   */
  async registrarLogAcesso(dados) {
    const { data, error } = await this.#supabase
      .from('data_access_log')
      .insert({
        accessed_by:    dados.accessed_by,
        target_user_id: dados.target_user_id,
        data_type:      dados.data_type,
        purpose:        dados.purpose,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = LgpdRepository;
