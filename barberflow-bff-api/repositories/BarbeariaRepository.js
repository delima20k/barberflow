'use strict';

const BaseRepository = require('./BaseRepository');

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
    'id, name, address, city, latitude, longitude, ' +
    'logo_path, cover_path, is_open, close_reason, ' +
    'rating_avg, rating_count, rating_score, ' +
    'likes_count, dislikes_count, font_key';

  /** Campos do schema inicial — usados em fallback quando colunas opcionais não existem. */
  static #SELECT_SAFE =
    'id, name, address, city, latitude, longitude, ' +
    'logo_path, cover_path, is_open, rating_avg, rating_count';

  /** Ordem de relevância aplicada em todas as listagens. */
  static #ORDER_PADRAO = Object.freeze(['rating_score', 'rating_avg', 'likes_count']);

  static #ordenar(query) {
    return BarbeariaRepository.#ORDER_PADRAO
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

    if (error) this._throwDbError(error, 'getNearby (fallback)');
    return data ?? [];
  }

  /**
   * Retorna barbearias em destaque ordenadas por avaliação.
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async getFeatured(limit = 6) {
    const { data, error } = await BarbeariaRepository.#ordenar(
      this._db
        .from('barbershops')
        .select(BarbeariaRepository.#SELECT)
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

    if (error) this._throwDbError(error, 'getFeatured (fallback)');
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

    if (error) this._throwDbError(error, 'getAll (fallback)');
    return data ?? [];
  }
}

module.exports = BarbeariaRepository;
