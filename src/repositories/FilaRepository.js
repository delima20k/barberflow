'use strict';

// =============================================================
// FilaRepository.js — Repositório de fila de espera.
// Camada: infra
//
// Tabela: queue_entries.
// Sem lógica de negócio — apenas acesso e persistência.
// =============================================================

const BaseRepository = require('../infra/BaseRepository');

class FilaRepository extends BaseRepository {

  #supabase;

  static #SELECT_ENTRADA = `
    id, barbershop_id, user_id, chair_id, status, position, notes, created_at,
    profile:profiles!user_id(full_name, avatar_path),
    chair:chairs!chair_id(name)
  `;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('FilaRepository');
    this.#supabase = supabase;
  }

  /**
   * Retorna entradas ativas da fila de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async getFila(barbershopId) {
    this._validarUuid('barbershopId', barbershopId);

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
    this._validarUuid('id', id);

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
    this._validarUuid('barbershopId', barbershopId);
    this._validarUuid('userId', userId);

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
   * Remove a entrada da fila (hard delete com verificação de ownership).
   * @param {string} entradaId
   * @param {string} userId — verifica ownership via eq('user_id')
   * @returns {Promise<boolean>}
   */
  async sair(entradaId, userId) {
    this._validarUuid('entradaId', entradaId);
    this._validarUuid('userId', userId);

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
    this._validarUuid('entradaId', entradaId);

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
