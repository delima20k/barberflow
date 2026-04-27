'use strict';

// =============================================================
// FilaRepository.js — Repositório de fila de espera.
// Camada: infra
//
// Tabela: queue_entries.
// Sem lógica de negócio — apenas acesso e persistência.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class FilaRepository {

  #supabase;

  static #SELECT_ENTRADA = `
    id, barbershop_id, user_id, chair_id, status, position, notes, created_at,
    profile:profiles!user_id(full_name, avatar_path),
    chair:chairs!chair_id(name)
  `;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    this.#supabase = supabase;
  }

  /**
   * Retorna entradas ativas da fila de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async getFila(barbershopId) {
    const rId = InputValidator.uuid(barbershopId);
    if (!rId.ok) throw new TypeError(`[FilaRepository] barbershopId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('queue_entries')
      .select(FilaRepository.#SELECT_ENTRADA)
      .eq('barbershop_id', barbershopId)
      .in('status', ['waiting', 'in_service'])
      .order('position', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Busca uma entrada da fila pelo ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getEntrada(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw new TypeError(`[FilaRepository] id: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('queue_entries')
      .select(FilaRepository.#SELECT_ENTRADA)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }

  /**
   * Insere usuário na fila.
   * @param {string} barbershopId
   * @param {string} userId
   * @param {object} [dados] — { chair_id?, notes? }
   * @returns {Promise<object>}
   */
  async entrar(barbershopId, userId, dados = {}) {
    const { data, error } = await this.#supabase
      .from('queue_entries')
      .insert({
        barbershop_id: barbershopId,
        user_id:       userId,
        chair_id:      dados.chair_id ?? null,
        notes:         dados.notes    ?? null,
        status:        'waiting',
      })
      .select(FilaRepository.#SELECT_ENTRADA)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Remove usuário da fila (status → cancelled).
   * @param {string} entradaId
   * @param {string} userId — verifica ownership
   * @returns {Promise<boolean>}
   */
  async sair(entradaId, userId) {
    const rEnt = InputValidator.uuid(entradaId);
    const rUsr = InputValidator.uuid(userId);
    if (!rEnt.ok) throw new TypeError(`[FilaRepository] entradaId: ${rEnt.msg}`);
    if (!rUsr.ok) throw new TypeError(`[FilaRepository] userId: ${rUsr.msg}`);

    const { error } = await this.#supabase
      .from('queue_entries')
      .delete()
      .eq('id', entradaId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  /**
   * Atualiza o status de uma entrada da fila.
   * @param {string} entradaId
   * @param {string} novoStatus
   * @returns {Promise<object>}
   */
  async atualizarStatus(entradaId, novoStatus) {
    const rId = InputValidator.uuid(entradaId);
    if (!rId.ok) throw new TypeError(`[FilaRepository] entradaId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('queue_entries')
      .update({ status: novoStatus })
      .eq('id', entradaId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = FilaRepository;
