'use strict';

const BaseRepository = require('./BaseRepository');
const AppError       = require('../utils/AppError');

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
   * Lista agendamentos do cliente com suporte a cursor pagination.
   * @param {string} clientId — UUID do cliente
   * @param {object} [opts]
   * @param {string} [opts.cursor]  — valor de `scheduled_at` da última linha da página anterior
   * @param {number} [opts.limit=20]
   * @returns {Promise<{ items: object[], nextCursor: string|null }>}
   */
  async getByCliente(clientId, { cursor, limit = 20 } = {}) {
    this._uuid('client_id', clientId);

    const pageSize = Math.min(Math.max(1, limit), 100);

    let query = this._db
      .from('appointments')
      .select(AgendamentoRepository.#SELECT)
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: false })
      .limit(pageSize + 1); // +1 para detectar se há próxima página

    if (cursor) query = query.lt('scheduled_at', cursor);

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'getByCliente');

    const rows    = data ?? [];
    const hasMore = rows.length > pageSize;
    const items   = hasMore ? rows.slice(0, pageSize) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].scheduled_at : null,
    };
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
   * Cria um agendamento via RPC atômica (resolve race condition).
   * A função PostgreSQL `criar_agendamento_atomico` usa advisory lock
   * por profissional e verifica conflitos dentro da mesma transação.
   * @param {object} dados — campos validados pelo serviço
   * @returns {Promise<object>} — agendamento com joins completos
   */
  async criarAtomico(dados) {
    const p = this._payload(dados, AgendamentoRepository.#CAMPOS_CRIACAO);

    const { data, error } = await this._db
      .rpc('criar_agendamento_atomico', {
        p_client_id:       p.client_id,
        p_professional_id: p.professional_id,
        p_barbershop_id:   p.barbershop_id,
        p_service_id:      p.service_id,
        p_scheduled_at:    p.scheduled_at,
        p_duration_min:    p.duration_min,
        p_notes:           p.notes          ?? null,
        p_price_charged:   p.price_charged  ?? null,
      })
      .single();

    // P0001 = exceção definida pelo usuário (SCHEDULE_CONFLICT)
    if (error?.code === 'P0001') {
      throw AppError.conflict('Horário não disponível: conflito com agendamento existente.');
    }
    if (error) this._throwDbError(error, 'criarAtomico');

    // Busca com joins completos (RPC retorna apenas colunas brutas)
    return this.getById(data.id);
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
      .select(AgendamentoRepository.#SELECT)
      .single();

    if (error) this._throwDbError(error, 'atualizarStatus');
    return data;
  }

  /**
   * Busca agendamentos do profissional em uma janela de tempo para verificar conflitos.
   * Mantido para uso direto (ex: diagnóstico, admin) — criação usa criarAtomico().
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
