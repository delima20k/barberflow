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

  /** Campos base retornados em todas as consultas. */
  static #SELECT =
    'id, name, address, city, latitude, longitude, ' +
    'logo_path, cover_path, is_open, close_reason, ' +
    'rating_avg, rating_count, rating_score, ' +
    'likes_count, dislikes_count, font_key';

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

    // Se a migration PostGIS ainda não foi aplicada, usa bounding-box
    const semRpc =
      error.code === '42883' ||                           // undefined_function (PostgreSQL)
      String(error.message ?? '').includes('Could not find the function') ||
      String(error.message ?? '').includes('does not exist');

    if (!semRpc) this._throwDbError(error, 'getNearby');

    return this.#getNearbyFallback(lat, lng, raioKm, limit);
  }

  /**
   * Fallback bounding-box para quando PostGIS não está disponível.
   * Remove a necessidade de migração para o app funcionar.
   */
  async #getNearbyFallback(lat, lng, raioKm, limit) {
    const latD = raioKm / 111.0;
    const lonD = raioKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT)
      .eq('is_active', true)
      .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
      .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false })
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

    if (error) this._throwDbError(error, 'getFeatured');
    return data ?? [];
  }

  /**
   * Retorna todas as barbearias ativas ordenadas por popularidade
   * (cortes realizados → score → avaliação).
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

    if (error) this._throwDbError(error, 'getAll');
    return data ?? [];
  }
}

module.exports = BarbeariaRepository;
