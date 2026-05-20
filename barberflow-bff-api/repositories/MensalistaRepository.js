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
   * Usa duas queries explícitas para evitar dependência do PostgREST FK join.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listar(barbershopId) {
    this._uuid('barbershop_id', barbershopId);

    const { data: rows, error } = await this._db
      .from('barbershop_mensalistas')
      .select('id, client_id, starts_at, ends_at')
      .eq('barbershop_id', barbershopId)
      .gt('ends_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) this._throwDbError(error, 'listar');
    if (!rows?.length) return [];

    const clientIds = [...new Set(rows.map(r => r.client_id))];
    const { data: perfis, error: profErr } = await this._db
      .from('profiles')
      .select('id, full_name, avatar_path')
      .in('id', clientIds);
    if (profErr) this._throwDbError(profErr, 'listar');

    const perfilMap = Object.fromEntries((perfis ?? []).map(p => [p.id, p]));
    return rows.map(r => ({
      id:        r.id,
      starts_at: r.starts_at,
      ends_at:   r.ends_at,
      client:    perfilMap[r.client_id] ?? null,
    }));
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
   * Busca textual de perfis para adicionar como mensalista.
   *
   * IMPORTANTE: o termo `q` é OBRIGATÓRIO e não vazio. Sem termo,
   * retorna `[]` — a lista automática de elegíveis deve usar
   * `listarFavoritosElegiveis`, que respeita a regra de favorito.
   *
   * @param {string} barbershopId
   * @param {string} q            — termo de busca (mín. 1 caractere após trim)
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async buscarClientesDisponiveis(barbershopId, q, limit = 20) {
    this._uuid('barbershop_id', barbershopId);

    const busca = (q ?? '').trim();
    if (!busca) return [];

    // IDs de mensalistas ativos desta barbearia (para excluir do resultado)
    const { data: ativos } = await this._db
      .from('barbershop_mensalistas')
      .select(MensalistaRepository.#SELECT_CLIENT_ID)
      .eq('barbershop_id', barbershopId)
      .gt('ends_at', new Date().toISOString());

    const idsAtivos = (ativos ?? []).map(r => r.client_id);

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

  /**
   * Lista perfis elegíveis a se tornarem mensalistas: usuários que
   * favoritaram a barbearia ou QUALQUER barbeiro vinculado a ela,
   * excluindo quem já é mensalista ativo.
   *
   * Tenta RPC `get_clientes_favoritos_barbearia` (migration 20260520000001).
   * Se a RPC ainda não existe em produção, usa fallback com queries diretas.
   *
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarFavoritosElegiveis(barbershopId) {
    this._uuid('barbershop_id', barbershopId);

    // 1) Favoritos via RPC (UNION distinto, ordenado por nome)
    const { data: rpcData, error: errRpc } = await this._db.rpc(
      'get_clientes_favoritos_barbearia',
      { p_barbershop_id: barbershopId },
    );

    let listaRaw;
    if (errRpc) {
      if (!MensalistaRepository.#ehRpcInexistente(errRpc)) {
        this._throwDbError(errRpc, 'listarFavoritosElegiveis');
      }
      this._warn('listarFavoritosElegiveis', errRpc);
      listaRaw = await this.#favoritosElegiveísFallback(barbershopId);
    } else {
      listaRaw = rpcData ?? [];
    }

    if (!listaRaw.length) return [];

    // 2) IDs de mensalistas ativos para excluir
    const { data: ativos, error: errAtivos } = await this._db
      .from('barbershop_mensalistas')
      .select(MensalistaRepository.#SELECT_CLIENT_ID)
      .eq('barbershop_id', barbershopId)
      .gt('ends_at', new Date().toISOString());
    if (errAtivos) this._throwDbError(errAtivos, 'listarFavoritosElegiveis');

    const idsAtivos = new Set((ativos ?? []).map(r => r.client_id));

    return listaRaw
      .filter(p => !idsAtivos.has(p.id))
      .map(p => ({
        id:          p.id,
        full_name:   p.full_name   ?? 'Cliente',
        email:       p.email       ?? null,
        avatar_path: p.avatar_path ?? null,
        updated_at:  p.updated_at  ?? null,
      }));
  }

  /**
   * Lista perfis que favoritaram a barbearia OU esse barbeiro específico.
   * Usado pela modal da cadeirinha (ClienteSeletorModal).
   *
   * Tenta RPC `get_clientes_favoritos_modal` (migration 20260507000002).
   * Se a RPC ainda não existe em produção, usa fallback com queries diretas.
   *
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async listarFavoritosModal(barbershopId, professionalId) {
    this._uuid('barbershop_id',   barbershopId);
    this._uuid('professional_id', professionalId);

    const { data, error } = await this._db.rpc('get_clientes_favoritos_modal', {
      p_barbershop_id:   barbershopId,
      p_professional_id: professionalId,
    });

    if (!error) return (data ?? []).map(p => ({
      id:          p.id,
      full_name:   p.full_name   ?? 'Cliente',
      email:       p.email       ?? null,
      avatar_path: p.avatar_path ?? null,
      updated_at:  p.updated_at  ?? null,
    }));

    if (!MensalistaRepository.#ehRpcInexistente(error)) {
      this._throwDbError(error, 'listarFavoritosModal');
    }
    this._warn('listarFavoritosModal', error);
    return this.#favoritosModalFallback(barbershopId, professionalId);
  }

  // ── Helpers privados ─────────────────────────────────────────────

  /**
   * Fallback para listarFavoritosModal quando RPC não existe.
   * UNION manual: favoritos da barbearia + favoritos desse barbeiro específico.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async #favoritosModalFallback(barbershopId, professionalId) {
    const ids = new Set();

    const { data: shopFavs } = await this._db
      .from('barbershop_interactions')
      .select('user_id')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'favorite');
    (shopFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });

    const { data: profFavs } = await this._db
      .from('favorite_professionals')
      .select('user_id')
      .eq('professional_id', professionalId);
    (profFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });

    if (!ids.size) return [];

    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, email, avatar_path, updated_at')
      .in('id', [...ids])
      .order('full_name');

    if (error) return [];
    return (data ?? []).map(p => ({
      id:          p.id,
      full_name:   p.full_name   ?? 'Cliente',
      email:       p.email       ?? null,
      avatar_path: p.avatar_path ?? null,
      updated_at:  p.updated_at  ?? null,
    }));
  }

  /**
   * Fallback para listarFavoritosElegiveis quando RPC não existe.
   * UNION manual: favoritos da barbearia + favoritos de barbeiros vinculados.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async #favoritosElegiveísFallback(barbershopId) {
    const ids = new Set();

    const { data: shopFavs } = await this._db
      .from('barbershop_interactions')
      .select('user_id')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'favorite');
    (shopFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });

    const { data: links } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);
    const profIds = (links ?? []).map(l => l.professional_id).filter(Boolean);

    if (profIds.length > 0) {
      const { data: profFavs } = await this._db
        .from('favorite_professionals')
        .select('user_id')
        .in('professional_id', profIds);
      (profFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });
    }

    if (!ids.size) return [];

    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, email, avatar_path, updated_at')
      .in('id', [...ids])
      .order('full_name');

    if (error) return [];
    return data ?? [];
  }

  /**
   * Verifica se o erro indica que a RPC não existe no banco.
   * Códigos: PGRST202 (PostgREST) ou 42883 (PostgreSQL UNDEFINED_FUNCTION).
   * @param {object} error
   * @returns {boolean}
   */
  static #ehRpcInexistente(error) {
    if (!error) return false;
    const code = String(error.code ?? '');
    const msg  = String(error.message ?? '').toLowerCase();
    return code === 'PGRST202' || code === '42883'
      || msg.includes('could not find the function')
      || msg.includes('does not exist');
  }
}

module.exports = MensalistaRepository;
