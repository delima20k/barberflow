'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * MensalistaRepository — Acesso a dados de mensalistas via Supabase.
 *
 * Operações sobre `barbershop_mensalistas` e leitura auxiliar de `profiles`.
 * O BFF usa service_role_key, portanto bypassa RLS.
 *
 * Camada: infra
 */
class MensalistaRepository extends BaseRepository {

  static #SELECT_MENSALISTA  = 'id, starts_at, ends_at, client:profiles!client_id(id, full_name, avatar_path)';
  static #SELECT_ROW         = 'id, barbershop_id, client_id';
  static #SELECT_DISPONIVEIS = 'id, full_name, avatar_path, email';
  static #SELECT_CLIENT_ID   = 'client_id';

  /** @param {import('@supabase/supabase-js').SupabaseClient} db */
  constructor(db) {
    super('MensalistaRepository', db);
  }

  // ── Mutações ────────────────────────────────────────────────────

  /**
   * Upsert de mensalista: insere ou renova o plano por 30 dias.
   * @param {string} barbershopId
   * @param {string} clientId
   * @returns {Promise<object>} row inserida/atualizada
   */
  async adicionar(barbershopId, clientId) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);

    const now    = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this._db
      .from('barbershop_mensalistas')
      .upsert(
        { barbershop_id: barbershopId, client_id: clientId, starts_at: now.toISOString(), ends_at: endsAt },
        { onConflict: 'barbershop_id,client_id' },
      )
      .select('id, barbershop_id, client_id, starts_at, ends_at')
      .single();

    if (error) this._throwDbError(error, 'adicionar');
    return data;
  }

  /**
   * Remove mensalista pelo ID.
   * @param {string} id
   */
  async remover(id) {
    this._uuid('id', id);

    const { error } = await this._db
      .from('barbershop_mensalistas')
      .delete()
      .eq('id', id);

    if (error) this._throwDbError(error, 'remover');
  }

  // ── Consultas ────────────────────────────────────────────────────

  /**
   * Lista mensalistas ativos de uma barbearia com dados do perfil.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listar(barbershopId) {
    this._uuid('barbershop_id', barbershopId);

    const { data, error } = await this._db
      .from('barbershop_mensalistas')
      .select(MensalistaRepository.#SELECT_MENSALISTA)
      .eq('barbershop_id', barbershopId)
      .gt('ends_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) this._throwDbError(error, 'listar');
    return data ?? [];
  }

  /**
   * Verifica se um cliente é mensalista ativo em uma barbearia.
   * @param {string} barbershopId
   * @param {string} clientId
   * @returns {Promise<boolean>}
   */
  async verificar(barbershopId, clientId) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);

    const { data, error } = await this._db
      .from('barbershop_mensalistas')
      .select('id')
      .eq('barbershop_id', barbershopId)
      .eq('client_id',     clientId)
      .gt('ends_at', new Date().toISOString())
      .maybeSingle();

    if (error) this._throwDbError(error, 'verificar');
    return data !== null;
  }

  /**
   * Busca uma row por ID (usado para verificar ownership antes de deletar).
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getById(id) {
    this._uuid('id', id);

    const { data, error } = await this._db
      .from('barbershop_mensalistas')
      .select(MensalistaRepository.#SELECT_ROW)
      .eq('id', id)
      .maybeSingle();

    if (error) this._throwDbError(error, 'getById');
    return data ?? null;
  }

  /**
   * Busca perfis disponíveis para se tornar mensalista (excluindo quem já é).
   * @param {string} barbershopId
   * @param {string} q            — termo de busca (full_name ILIKE)
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async buscarClientesDisponiveis(barbershopId, q, limit = 20) {
    this._uuid('barbershop_id', barbershopId);

    // IDs de mensalistas ativos desta barbearia
    const { data: ativos } = await this._db
      .from('barbershop_mensalistas')
      .select(MensalistaRepository.#SELECT_CLIENT_ID)
      .eq('barbershop_id', barbershopId)
      .gt('ends_at', new Date().toISOString());

    const idsAtivos = (ativos ?? []).map(r => r.client_id);

    const busca = (q ?? '').trim();
    let query = this._db
      .from('profiles')
      .select(MensalistaRepository.#SELECT_DISPONIVEIS)
      .ilike('full_name', `%${busca}%`)
      .limit(Math.min(limit, 50));

    if (idsAtivos.length > 0) {
      query = query.not('id', 'in', `(${idsAtivos.join(',')})`);
    }

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'buscarClientesDisponiveis');
    return data ?? [];
  }
}

module.exports = MensalistaRepository;
