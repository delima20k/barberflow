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

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   */
  constructor(db) {
    super('BarbeariaRepository', db);
  }

  // ── Consultas ────────────────────────────────────────────────────

  /**
   * Busca barbearias dentro de um bounding-box geográfico.
   * Filtro Haversine preciso é aplicado na camada de serviço.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} latDelta
   * @param {number} lngDelta
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async getNearby(lat, lng, latDelta, lngDelta, limit = 50) {
    this._coordenada(lat, lng);

    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT)
      .eq('is_active', true)
      .gte('latitude',  lat - latDelta)
      .lte('latitude',  lat + latDelta)
      .gte('longitude', lng - lngDelta)
      .lte('longitude', lng + lngDelta)
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false })
      .limit(limit);

    if (error) this._throwDbError(error, 'getNearby');
    return data ?? [];
  }

  /**
   * Retorna barbearias em destaque ordenadas por avaliação.
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async getFeatured(limit = 6) {
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT)
      .eq('is_active', true)
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false })
      .order('rating_avg',   { ascending: false })
      .limit(limit);

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
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT)
      .eq('is_active', true)
      .order('likes_count',  { ascending: false })
      .order('rating_score', { ascending: false })
      .order('rating_avg',   { ascending: false })
      .limit(limit);

    if (error) this._throwDbError(error, 'getAll');
    return data ?? [];
  }
}

module.exports = BarbeariaRepository;
