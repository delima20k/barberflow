'use strict';

// =============================================================
// SearchRepository.js — Repositório dedicado à busca de usuários.
// Camada: infra / repositories
//
// Responsabilidades:
//   - Busca unificada de usuários via RPC search_users
//     (profiles + barbershops em uma única query parametrizada)
//   - Retorno de clientes favoritos de um barbeiro/barbearia
//     via RPC get_clientes_favoritos_modal (já deployada)
//
// Segurança:
//   - Todas as queries passam por RPC com parâmetros substituídos
//     pelo planner do PostgreSQL — zero concatenação de string.
//   - Usa service_role; NÃO deve ser importado pelo frontend.
//
// Não contém lógica de negócio — apenas acesso ao banco.
// =============================================================

const BaseRepository = require('../infra/BaseRepository');

/** Roles válidas para filtro de busca. */
const ROLES_VALIDAS = Object.freeze(['client', 'professional']);

/** Limite máximo de resultados por página. */
const LIMITE_MAXIMO = 50;

/** Limite padrão de resultados por página. */
const LIMITE_PADRAO = 20;

class SearchRepository extends BaseRepository {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('SearchRepository');
    if (!supabase) throw new TypeError('[SearchRepository] supabase client obrigatório');
    this.#supabase = supabase;
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca usuários por nome, e-mail ou nome da barbearia.
   *
   * Delega para o RPC PostgreSQL `search_users`, que executa um
   * LEFT JOIN profiles + barbershops em uma única query.
   * Todos os filtros são parâmetros — zero SQL injection.
   *
   * @param {object}      opts
   * @param {string}      opts.term    — termo de busca (obrigatório)
   * @param {string|null} [opts.role]  — 'client' | 'professional' | null (sem filtro)
   * @param {number}      [opts.limit] — máx. resultados (1–50; default 20)
   * @param {number}      [opts.offset]— paginação (≥0; default 0)
   * @returns {Promise<{ itens: SearchUserResult[], total: number }>}
   */
  async searchUsers({ term, role = null, limit = LIMITE_PADRAO, offset = 0 } = {}) {
    this.#validarTerm(term);
    this.#validarRole(role);
    const lim = SearchRepository.#normalizarLimit(limit);
    const off = SearchRepository.#normalizarOffset(offset);

    const { data, error } = await this.#supabase.rpc('search_users', {
      p_term:   term.trim(),
      p_role:   role ?? null,
      p_limit:  lim,
      p_offset: off,
    });

    // Fallback: quando a RPC ainda não existe no banco (antes de migration)
    if (error && SearchRepository.#ehErroProcedureNaoExiste(error)) {
      return this.#searchUsersFallback(term.trim(), role, lim, off);
    }
    if (error) throw error;

    const rows  = data ?? [];
    const total = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
    return { itens: rows.map(SearchRepository.#mapearUsuario), total };
  }

  /**
   * Retorna clientes que favoritaram a barbearia ou o barbeiro.
   *
   * Delega para o RPC `get_clientes_favoritos_modal` (já deployado),
   * que faz UNION de barbershop_interactions + favorite_professionals.
   *
   * @param {string} barbershopId   — UUID da barbearia
   * @param {string} professionalId — UUID do profissional
   * @returns {Promise<{ itens: FavoriteClientResult[], total: number }>}
   */
  async getFavoriteClients(barbershopId, professionalId) {
    this._validarUuid('barbershopId',   barbershopId);
    this._validarUuid('professionalId', professionalId);

    const { data, error } = await this.#supabase.rpc('get_clientes_favoritos_modal', {
      p_barbershop_id:   barbershopId,
      p_professional_id: professionalId,
    });

    // Fallback: quando a RPC ainda não existe no banco (antes de migration)
    if (error && SearchRepository.#ehErroProcedureNaoExiste(error)) {
      return this.#getFavoriteClientsFallback(barbershopId, professionalId);
    }
    if (error) throw error;

    const itens = (data ?? []).map(SearchRepository.#mapearFavorito);
    return { itens, total: itens.length };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fallbacks (quando RPC ainda não existe no banco)
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica se o erro indica que a procedure não existe no banco.
   * Códigos: PGRST202 (PostgREST), 42883 (PostgreSQL UNDEFINED_FUNCTION).
   * @param {object} error
   * @returns {boolean}
   */
  static #ehErroProcedureNaoExiste(error) {
    if (!error) return false;
    const code = String(error.code ?? '');
    const msg  = String(error.message ?? '').toLowerCase();
    return code === 'PGRST202' || code === '42883'
      || msg.includes('could not find the function') || msg.includes('does not exist');
  }

  /**
   * Fallback para searchUsers: query direta quando RPC search_users não existe.
   * Só busca em full_name (sem email). Após migration, a RPC assume automaticamente.
   * @returns {Promise<{ itens: SearchUserResult[], total: number }>}
   */
  async #searchUsersFallback(term, role, limit, offset) {
    let query = this.#supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_path, updated_at', { count: 'exact' })
      .ilike('full_name', `%${term}%`)
      .eq('is_active', true)
      .order('full_name')
      .range(offset, offset + limit - 1);

    if (role) query = query.eq('role', role);

    const { data, error, count } = await query;
    if (error) throw error;

    const itens = (data ?? []).map(row => ({
      id:              row.id,
      full_name:       row.full_name   ?? null,
      email:           row.email       ?? null,
      role:            row.role        ?? null,
      avatar_path:     row.avatar_path ?? null,
      barbershop_name: null,
      updated_at:      row.updated_at  ?? null,
    }));
    return { itens, total: count ?? itens.length };
  }

  /**
   * Fallback para getFavoriteClients: queries diretas quando RPC não existe.
   * @returns {Promise<{ itens: FavoriteClientResult[], total: number }>}
   */
  async #getFavoriteClientsFallback(barbershopId, professionalId) {
    const ids = new Set();

    // Apenas quem favoritou este profissional específico
    const { data: profFavs } = await this.#supabase
      .from('favorite_professionals')
      .select('user_id')
      .eq('professional_id', professionalId);
    (profFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });

    if (!ids.size) return { itens: [], total: 0 };

    const { data, error } = await this.#supabase
      .from('profiles')
      .select('id, full_name, email, avatar_path, updated_at')
      .in('id', [...ids])
      .order('full_name');

    if (error) throw error;
    const itens = (data ?? []).map(SearchRepository.#mapearFavorito);
    return { itens, total: itens.length };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Validadores
  // ═══════════════════════════════════════════════════════════

  /**
   * Valida o termo de busca.
   * @param {unknown} term
   */
  #validarTerm(term) {
    if (typeof term !== 'string' || !term.trim()) {
      throw new TypeError('[SearchRepository] term deve ser uma string não vazia');
    }
    if (term.trim().length > 100) {
      throw new TypeError('[SearchRepository] term excede 100 caracteres');
    }
  }

  /**
   * Valida a role de filtro (null = sem filtro).
   * @param {unknown} role
   */
  #validarRole(role) {
    if (role !== null && role !== undefined && !ROLES_VALIDAS.includes(role)) {
      throw new TypeError(
        `[SearchRepository] role inválida: "${role}". Valores aceitos: ${ROLES_VALIDAS.join(', ')}`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Normalizadores (static — sem acesso a estado)
  // ═══════════════════════════════════════════════════════════

  /**
   * Normaliza limit para [1, LIMITE_MAXIMO].
   * @param {unknown} limit
   * @returns {number}
   */
  static #normalizarLimit(limit) {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1) return LIMITE_PADRAO;
    return Math.min(Math.floor(n), LIMITE_MAXIMO);
  }

  /**
   * Normaliza offset para ≥ 0.
   * @param {unknown} offset
   * @returns {number}
   */
  static #normalizarOffset(offset) {
    const n = Number(offset);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  /**
   * Mapeia linha da RPC search_users para objeto público seguro.
   * @param {object} row
   * @returns {SearchUserResult}
   */
  static #mapearUsuario(row) {
    return {
      id:              row.id,
      full_name:       row.full_name       ?? null,
      email:           row.email           ?? null,
      role:            row.role            ?? null,
      avatar_path:     row.avatar_path     ?? null,
      barbershop_name: row.barbershop_name ?? null,
      updated_at:      row.updated_at      ?? null,
    };
  }

  /**
   * Mapeia linha da RPC get_clientes_favoritos_modal para objeto público seguro.
   * @param {object} row
   * @returns {FavoriteClientResult}
   */
  static #mapearFavorito(row) {
    return {
      id:          row.id,
      full_name:   row.full_name   ?? 'Cliente',
      email:       row.email       ?? null,
      avatar_path: row.avatar_path ?? null,
      updated_at:  row.updated_at  ?? null,
    };
  }
}

/**
 * @typedef {object} SearchUserResult
 * @property {string}      id
 * @property {string|null} full_name
 * @property {string|null} email
 * @property {string|null} role
 * @property {string|null} avatar_path
 * @property {string|null} barbershop_name
 * @property {string|null} updated_at
 */

/**
 * @typedef {object} FavoriteClientResult
 * @property {string}      id
 * @property {string}      full_name
 * @property {string|null} email
 * @property {string|null} avatar_path
 * @property {string|null} updated_at
 */

module.exports = SearchRepository;
