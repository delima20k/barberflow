'use strict';

// =============================================================
// AgendamentoRepository.js — Repositório de agendamentos.
// Camada: infra
//
// Única camada que acessa o banco de dados (tabela: appointments).
// Sem lógica de negócio — apenas acesso e persistência.
// Usa @supabase/supabase-js com service_role key.
// =============================================================

const InputValidator = require('../infra/InputValidator');
const BaseRepository  = require('../infra/BaseRepository');

class AgendamentoRepository extends BaseRepository {

  #supabase;

  static #SELECT_COMPLETO = `
    id, scheduled_at, duration_min, status, notes, price_charged, created_at,
    client:profiles!client_id(id, full_name, avatar_path),
    professional:professionals!professional_id(id,
      profile:profiles!id(full_name, avatar_path)),
    service:services!service_id(name, category, duration_min, price),
    barbershop:barbershops!barbershop_id(id, name, address)
  `;

  static #CAMPOS_CRIACAO = [
    'client_id', 'professional_id', 'barbershop_id', 'service_id',
    'scheduled_at', 'duration_min', 'notes', 'price_charged',
  ];

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('AgendamentoRepository');
    this.#supabase = supabase;
  }

  /**
   * Busca agendamentos de um profissional em um período.
   * @param {string} professionalId
   * @param {Date}   inicio
   * @param {Date}   fim
   * @returns {Promise<object[]>}
   */
  async getByProfissional(professionalId, inicio, fim) {
    this._validarUuid('professionalId', professionalId);

    const { data, error } = await this.#supabase
      .from('appointments')
      .select(AgendamentoRepository.#SELECT_COMPLETO)
      .eq('professional_id', professionalId)
      .gte('scheduled_at', inicio.toISOString())
      .lte('scheduled_at', fim.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Busca agendamentos de um cliente.
   * @param {string} clientId
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async getByCliente(clientId, limit = 20) {
    this._validarUuid('clientId', clientId);

    const { data, error } = await this.#supabase
      .from('appointments')
      .select(AgendamentoRepository.#SELECT_COMPLETO)
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Busca um agendamento pelo ID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getById(id) {
    this._validarUuid('id', id);

    const { data, error } = await this.#supabase
      .from('appointments')
      .select(AgendamentoRepository.#SELECT_COMPLETO)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Cria um novo agendamento.
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async criar(dados) {
    const valor = this._validarPayload(dados, AgendamentoRepository.#CAMPOS_CRIACAO);

    const { data, error } = await this.#supabase
      .from('appointments')
      .insert(valor)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza o status de um agendamento.
   * @param {string} id
   * @param {string} status
   * @returns {Promise<object>}
   */
  async atualizarStatus(id, status) {
    this._validarUuid('id', id);

    const { data, error } = await this.#supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Cancela um agendamento (apenas se ainda puder ser cancelado).
   * @param {string} id
   * @returns {Promise<object>}
   */
  async cancelar(id) {
    return this.atualizarStatus(id, 'cancelled');
  }
}

module.exports = AgendamentoRepository;
