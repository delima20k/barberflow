'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * GeoRepository — Persistência de localização GPS do usuário em `profiles`.
 *
 * Operações:
 *   salvarLocalizacao(userId, lat, lng) — PATCH last_lat/lng/location_at
 *   carregarLocalizacao(userId)         — SELECT last_lat, last_lng, last_location_at
 *
 * Tabela: profiles
 * Camada: infra
 */
class GeoRepository extends BaseRepository {

  /** @type {string} Campos lidos no SELECT de localização */
  static #CAMPOS = 'last_lat, last_lng, last_location_at';

  /** @param {import('@supabase/supabase-js').SupabaseClient} db */
  constructor(db) {
    super('GeoRepository', db);
  }

  // ── Público ───────────────────────────────────────────────────

  /**
   * Salva a última posição GPS do usuário.
   * @param {string} userId — UUID do usuário
   * @param {number} lat    — latitude  (-90 a 90)
   * @param {number} lng    — longitude (-180 a 180)
   */
  async salvarLocalizacao(userId, lat, lng) {
    this._uuid('userId', userId);
    this._coordenada(lat, lng);

    const { error } = await this._db
      .from('profiles')
      .update({
        last_lat:         lat,
        last_lng:         lng,
        last_location_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) this._throwDbError(error, 'salvarLocalizacao');
  }

  /**
   * Carrega a última posição GPS salva do usuário.
   * @param {string} userId — UUID do usuário
   * @returns {Promise<{ last_lat: number, last_lng: number, last_location_at: string }|null>}
   */
  async carregarLocalizacao(userId) {
    this._uuid('userId', userId);

    const { data, error } = await this._db
      .from('profiles')
      .select(GeoRepository.#CAMPOS)
      .eq('id', userId)
      .single();

    // PGRST116 = nenhuma linha encontrada — não é erro fatal
    if (error && error.code !== 'PGRST116') {
      this._throwDbError(error, 'carregarLocalizacao');
    }

    return data ?? null;
  }
}

module.exports = GeoRepository;
