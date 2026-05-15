'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * AgendamentoRepository — Acesso a dados de agendamentos via Supabase.
 *
 * Responsabilidade única: operações CRUD na tabela `appointments`.
 * Regra de negócio fica em AgendamentoBffService.
 */
class AgendamentoRepository extends BaseRepository {

  static #SELECT = [
    'id, client_id, professional_id, barbershop_id, service_id,',
    'scheduled_at, duration_min, status, notes, price_charged, created_at,',
    'client:profiles!client_id(id, full_name, avatar_path),',
    'professional:professionals!professional_id(id,',
    '  profile:profiles!id(full_name, avatar_path)),',
    'service:services!service_id(name, category, duration_min, price),',
    'barbershop:barbershops!barbershop_id(id, name, address)',
  ].join(' ');

  static #SELECT_CONFLITO = 'id, scheduled_at, duration_min, status';

  static #CAMPOS_CRIACAO = [
    'client_id', 'professional_id', 'barbershop_id', 'service_id',
    'scheduled_at', 'duration_min', 'notes', 'price_charged',
  ];

  static #STATUS_ATIVOS = ['pending', 'confirmed', 'in_progress'];

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   */
  constructor(db) {
    super('AgendamentoRepository', db);
  }

  /**
   * Lista agendamentos do cliente em ordem cronológica decrescente.
   * @param {string} clientId — UUID do cliente
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async getByCliente(clientId, limit = 50) {
    this._uuid('client_id', clientId);

    const { data, error } = await this._db
      .from('appointments')
      .select(AgendamentoRepository.#SELECT)
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: false })
      .limit(limit);

    if (error) this._throwDbError(error, 'getByCliente');
    return data ?? [];
  }

  /**
   * Busca agendamento por ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getById(id) {
    this._uuid('id', id);

    const { data, error } = await this._db
      .from('appointments')
      .select(AgendamentoRepository.#SELECT)
      .eq('id', id)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) this._throwDbError(error, 'getById');
    return data;
  }

  /**
   * Cria um novo agendamento.
   * @param {object} dados — campos validados pelo serviço
   * @returns {Promise<object>}
   */
  async criar(dados) {
    const payload = this._payload(dados, AgendamentoRepository.#CAMPOS_CRIACAO);

    const { data, error } = await this._db
      .from('appointments')
      .insert(payload)
      .select()
      .single();

    if (error) this._throwDbError(error, 'criar');
    return data;
  }

  /**
   * Atualiza o status de um agendamento.
   * @param {string} id
   * @param {string} status
   * @returns {Promise<object>}
   */
  async atualizarStatus(id, status) {
    this._uuid('id', id);

    const { data, error } = await this._db
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) this._throwDbError(error, 'atualizarStatus');
    return data;
  }

  /**
   * Busca agendamentos do profissional em uma janela de tempo para verificar conflitos.
   * @param {string} professionalId
   * @param {Date}   inicio — início da janela de busca
   * @param {Date}   fim    — fim da janela
   * @returns {Promise<object[]>}
   */
  async getConflitos(professionalId, inicio, fim) {
    this._uuid('professional_id', professionalId);

    const { data, error } = await this._db
      .from('appointments')
      .select(AgendamentoRepository.#SELECT_CONFLITO)
      .eq('professional_id', professionalId)
      .in('status', AgendamentoRepository.#STATUS_ATIVOS)
      .gte('scheduled_at', inicio.toISOString())
      .lte('scheduled_at', fim.toISOString());

    if (error) this._throwDbError(error, 'getConflitos');
    return data ?? [];
  }
}

module.exports = AgendamentoRepository;
