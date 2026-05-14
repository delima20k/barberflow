'use strict';

const BaseService = require('./BaseService');

/**
 * GeoService (BFF) — Orquestra save/load de localização GPS do usuário logado.
 *
 * Operações:
 *   salvar(userId, lat, lng) — valida coords e delega ao repositório
 *   carregar(userId)         — retorna { lat, lng } ou null se inexistente/expirado (> 1h)
 *
 * Camada: application
 */
class GeoService extends BaseService {

  /** TTL máximo de uma posição salva para ser considerada válida: 1 hora */
  static #MAX_IDADE_MS = 60 * 60 * 1000;

  /** @type {import('../repositories/GeoRepository')} */
  #repo;

  /** @param {import('../repositories/GeoRepository')} repo */
  constructor(repo) {
    super('GeoService');
    this.#repo = repo;
  }

  // ── Público ───────────────────────────────────────────────────

  /**
   * Salva a posição GPS do usuário.
   * @param {string} userId
   * @param {number} lat
   * @param {number} lng
   */
  async salvar(userId, lat, lng) {
    this._uuid('userId', userId);
    this._coordenada(lat, lng);
    await this.#repo.salvarLocalizacao(userId, lat, lng);
  }

  /**
   * Carrega a última posição GPS salva.
   * Retorna null se não houver posição ou se tiver mais de 1 hora.
   * @param {string} userId
   * @returns {Promise<{ lat: number, lng: number }|null>}
   */
  async carregar(userId) {
    this._uuid('userId', userId);

    const row = await this.#repo.carregarLocalizacao(userId);
    if (!row?.last_lat || !row?.last_lng) return null;

    const ts = new Date(row.last_location_at).getTime();
    if (Date.now() - ts > GeoService.#MAX_IDADE_MS) return null;

    return { lat: Number(row.last_lat), lng: Number(row.last_lng) };
  }
}

module.exports = GeoService;
