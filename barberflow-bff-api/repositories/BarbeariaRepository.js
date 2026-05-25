'use strict';

const BaseRepository = require('./BaseRepository');
const AppError       = require('../utils/AppError');

/**
 * BarbeariaRepository — Repositório de barbearias para o BFF.
 *
 * Acessa a tabela `barbershops` do Supabase usando service_role_key.
 * Apenas leitura — sem mutações de dados.
 *
 * Camada: infra
 */
class BarbeariaRepository extends BaseRepository {

  /** Campos completos retornados em consultas quando migration aplicada. */
  static #SELECT =
    'id, name, address, city, state, zip_code, neighborhood, latitude, longitude, ' +
    'logo_path, cover_path, is_open, close_reason, ' +
    'rating_avg, rating_count, rating_score, ' +
    'likes_count, dislikes_count, font_key';

  /** Campos do schema inicial — usados em fallback quando colunas opcionais não existem. */
  static #SELECT_SAFE =
    'id, name, address, city, state, zip_code, neighborhood, latitude, longitude, ' +
    'logo_path, cover_path, is_open, rating_avg, rating_count';

  /** Campos seguros para retorno apos atualizar endereco. */
  static #SELECT_ENDERECO =
    'id, owner_id, name, address, city, state, zip_code, neighborhood, ' +
    'latitude, longitude, logo_path, cover_path, is_open';

  /** Campos minimos para operacoes autenticadas da barbearia do owner. */
  static #SELECT_OWNER = 'id, owner_id, name, logo_path, cover_path, is_active';

  /** Ordem de relevância aplicada em todas as listagens. */
  static #ORDER_PADRAO = Object.freeze(['rating_score', 'rating_avg', 'likes_count']);
  static #ORDER_DESTAQUE_SAFE = Object.freeze(['rating_avg', 'rating_count']);

  static #ordenar(query) {
    return BarbeariaRepository.#ORDER_PADRAO
      .reduce((q, col) => q.order(col, { ascending: false }), query);
  }

  static #ordenarDestaqueSafe(query) {
    return BarbeariaRepository.#ORDER_DESTAQUE_SAFE
      .reduce((q, col) => q.order(col, { ascending: false }), query);
  }

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   */
  constructor(db) {
    super('BarbeariaRepository', db);
  }

  // ── Consultas ────────────────────────────────────────────────────

  /**
   * Busca barbearias dentro de um raio geográfico.
   * Tenta PostGIS ST_DWithin via RPC (se migration aplicada);
   * em caso de falha por RPC inexistente, usa bounding-box como fallback.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} raioKm
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async getNearby(lat, lng, raioKm, limit = 50) {
    this._coordenada(lat, lng);

    const { data, error } = await this._db.rpc('get_barbershops_nearby', {
      lat,
      lng,
      raio_metros: raioKm * 1000,
      limit_val:   limit,
    });

    if (!error) return data ?? [];

    // RPC indisponível (PostGIS ausente, função inexistente ou outro erro de banco).
    // Registra aviso e mantém disponibilidade via fallback bounding-box.
    // O 500 só é lançado se o fallback também falhar (ver #getNearbyFallback).
    this._warn('getNearby → rpc', error);
    return this.#getNearbyFallback(lat, lng, raioKm, limit);
  }

  /**
   * Fallback bounding-box para quando PostGIS não está disponível.
   * Usa #SELECT_SAFE (colunas do schema inicial) para funcionar mesmo sem migrations opcionais.
   */
  async #getNearbyFallback(lat, lng, raioKm, limit) {
    const latD = raioKm / 111.0;
    const lonD = raioKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_SAFE)
      .eq('is_active', true)
      .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
      .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
      .order('rating_avg',   { ascending: false })
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) {
      this._warn('getNearby (fallback)', error);
      this._throwDbError(error, 'getNearby (fallback)');
    }
    return data ?? [];
  }

  /**
   * Retorna barbearias em destaque ordenadas por avaliação.
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async getFeatured(limit = 6) {
    const { data, error } = await BarbeariaRepository.#ordenarDestaqueSafe(
      this._db
        .from('barbershops')
        .select(BarbeariaRepository.#SELECT_SAFE)
        .eq('is_active', true),
    ).limit(limit);

    if (!error) return data ?? [];

    this._warn('getFeatured → fallback', error);
    return this.#getFeaturedFallback(limit);
  }

  /**
   * Fallback com colunas do schema inicial — ativo quando colunas opcionais
   * (rating_score, likes_count, dislikes_count, font_key, close_reason)
   * ainda não foram adicionadas ao projeto Supabase.
   */
  async #getFeaturedFallback(limit) {
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_SAFE)
      .eq('is_active', true)
      .order('rating_avg',   { ascending: false })
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) {
      this._warn('getFeatured (fallback)', error);
      this._throwDbError(error, 'getFeatured (fallback)');
    }
    return data ?? [];
  }

  /**
   * Retorna todas as barbearias ativas ordenadas por popularidade.
   * Tenta SELECT completo; se falhar (coluna ausente), usa #SELECT_SAFE.
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  async getAll(limit = 60) {
    const { data, error } = await BarbeariaRepository.#ordenar(
      this._db
        .from('barbershops')
        .select(BarbeariaRepository.#SELECT)
        .eq('is_active', true),
    ).limit(limit);

    if (!error) return data ?? [];

    this._warn('getAll → fallback', error);
    return this.#getAllFallback(limit);
  }

  /**
   * Fallback com colunas do schema inicial — ativo quando migrations opcionais
   * ainda não foram aplicadas ao projeto Supabase.
   */
  async #getAllFallback(limit) {
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_SAFE)
      .eq('is_active', true)
      .order('rating_avg',   { ascending: false })
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) {
      this._warn('getAll (fallback)', error);
      this._throwDbError(error, 'getAll (fallback)');
    }
    return data ?? [];
  }

  /**
   * Atualiza endereco e coordenadas da barbearia pertencente ao usuario autenticado.
   * @param {string} ownerId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async updateEndereco(ownerId, dados) {
    this._uuid('ownerId', ownerId);
    const payload = this._payload(dados, [
      'address',
      'city',
      'state',
      'zip_code',
      'neighborhood',
      'latitude',
      'longitude',
      'updated_at',
    ]);

    const { data, error } = await this._db
      .from('barbershops')
      .update(payload)
      .eq('owner_id', ownerId)
      .select(BarbeariaRepository.#SELECT_ENDERECO)
      .single();

    if (error) {
      this._warn('updateEndereco', error);
      this._throwDbError(error, 'updateEndereco');
    }
    return data;
  }

  /**
   * Busca a barbearia ativa pertencente ao owner autenticado.
   * @param {string} ownerId
   * @returns {Promise<object|null>}
   */
  async getAtivaPorOwner(ownerId) {
    this._uuid('ownerId', ownerId);
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_OWNER)
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      this._warn('getAtivaPorOwner', error);
      this._throwDbError(error, 'getAtivaPorOwner');
    }
    return data ?? null;
  }

  /**
   * Busca barbeiros elegíveis para convite da barbearia.
   * Exclui: o próprio dono, já vinculados à barbearia, com convite pendente.
   * @param {string} barbershopId
   * @param {string} ownerId
   * @param {string} busca — filtro parcial por full_name ou phone (ILIKE)
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async buscarBarbeirosDisponiveis(barbershopId, ownerId, busca, limit) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('ownerId', ownerId);

    const { data: linked } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);
    const excluidos = new Set((linked ?? []).map(r => r.professional_id));

    const { data: pending } = await this._db
      .from('barbershop_invites')
      .select('barbeiro_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'pendente');
    (pending ?? []).forEach(r => excluidos.add(r.barbeiro_id));

    excluidos.add(ownerId);

    let query = this._db
      .from('profiles')
      .select('id, full_name, avatar_path, phone, updated_at')
      .eq('role', 'profissional')
      // Inclui barbeiros legados (pro_type=null) registrados antes da migração de pro_type
      .or('pro_type.eq.barbeiro,pro_type.is.null')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .limit(limit + excluidos.size + 10);

    if (busca) {
      // Remove vírgulas e parênteses para não quebrar o parser de filtro do PostgREST
      const safe = busca.replace(/[,()]/g, '').trim();
      if (safe) {
        query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
      }
    }

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'buscarBarbeirosDisponiveis');

    return (data ?? []).filter(p => !excluidos.has(p.id)).slice(0, limit);
  }

  /**
   * Envia convites em massa para barbeiros, re-verificando elegibilidade no servidor.
   * @param {string}   barbershopId
   * @param {string[]} professionalIds
   * @param {number}   commissionPct
   * @param {string}   message
   * @returns {Promise<number>} quantidade de convites inseridos
   */
  async enviarConvites(barbershopId, professionalIds, commissionPct, message) {
    this._uuid('barbershopId', barbershopId);

    const { data: linked } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);

    const { data: pending } = await this._db
      .from('barbershop_invites')
      .select('barbeiro_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'pendente');

    const jaExcluidos = new Set([
      ...(linked  ?? []).map(r => r.professional_id),
      ...(pending ?? []).map(r => r.barbeiro_id),
    ]);

    const rows = professionalIds
      .filter(id => !jaExcluidos.has(id))
      .map(id => ({
        barbershop_id:  barbershopId,
        barbeiro_id:    id,
        commission_pct: commissionPct,
        message,
        status:         'pendente',
      }));

    if (!rows.length) {
      throw AppError.conflict('Nenhum barbeiro elegível para convite (já vinculados ou pendentes).');
    }

    const { error } = await this._db.from('barbershop_invites').insert(rows);
    if (error) {
      this._warn('enviarConvites', error);
      this._throwDbError(error, 'enviarConvites');
    }
    return rows.length;
  }

  /**
   * Salva arquivo processado no bucket publico de barbearias.
   * @param {string} path
   * @param {Buffer} buffer
   * @param {string} contentType
   * @returns {Promise<void>}
   */
  async uploadImagemBarbearia(path, buffer, contentType) {
    const { error } = await this._db.storage
      .from('barbershops')
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      this._warn('uploadImagemBarbearia', error);
      this._throwDbError(error, 'uploadImagemBarbearia');
    }
  }

  /**
   * Atualiza o path de logo/capa da barbearia do owner.
   * @param {string} ownerId
   * @param {'logo_path'|'cover_path'} campo
   * @param {string} path
   * @param {string} updatedAt
   * @returns {Promise<object>}
   */
  async updateImagem(ownerId, campo, path, updatedAt) {
    this._uuid('ownerId', ownerId);
    if (!['logo_path', 'cover_path'].includes(campo)) {
      throw new TypeError('campo de imagem invalido');
    }

    const { data, error } = await this._db
      .from('barbershops')
      .update({ [campo]: path, updated_at: updatedAt })
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .select(BarbeariaRepository.#SELECT_OWNER)
      .single();

    if (error) {
      this._warn('updateImagem', error);
      this._throwDbError(error, 'updateImagem');
    }
    return data;
  }

  /**
   * Monta URL publica do bucket barbershops.
   * @param {string} path
   * @returns {string}
   */
  getBarbershopPublicUrl(path) {
    const baseUrl = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    return `${baseUrl}/storage/v1/object/public/barbershops/${path}`;
  }
}

module.exports = BarbeariaRepository;
