'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

/**
 * BarbeariaService — Regras de negócio para barbearias no BFF.
 *
 * Aplica filtro Haversine sobre bounding-box retornado pelo repository.
 * Ordena resultados por distância.
 *
 * Camada: application
 */
class BarbeariaService extends BaseService {

  /** @type {import('../repositories/BarbeariaRepository')} */
  #repo;

  /** @param {import('../repositories/BarbeariaRepository')} repo */
  constructor(repo) {
    super('BarbeariaService');
    this.#repo = repo;
  }

  // ── Listagens ────────────────────────────────────────────────────

  /**
   * Lista barbearias próximas via PostGIS ST_DWithin (banco filtra e ordena).
   * Requer: migration 20260517000001_postgis_barbershops.sql aplicada.
   * @param {number} lat
   * @param {number} lng
   * @param {number} [raioKm=5]
   * @returns {Promise<object[]>}
   */
  async listarProximas(lat, lng, raioKm = 5) {
    this._coordenada(lat, lng);
    BarbeariaService.#validarRaio(raioKm);

    const rows = await this.#repo.getNearby(lat, lng, raioKm);

    // Converte distancia_m (metros, retornada pelo PostGIS) para distancia_km
    return rows.map(row => ({
      ...row,
      distancia_km: row.distancia_m != null ? row.distancia_m / 1000 : null,
    }));
  }

  /**
   * Lista barbearias em destaque (top rated).
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async listarDestaque(limit = 6) {
    BarbeariaService.#validarLimit(limit);
    return this.#repo.getFeatured(limit);
  }

  /**
   * Lista todas as barbearias ativas por popularidade.
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  async listarTodas(limit = 60) {
    BarbeariaService.#validarLimit(limit);
    return this.#repo.getAll(limit);
  }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Valida raio em km. Lança AppError(400) se inválido.
   * @param {number} raioKm
   */
  static #validarRaio(raioKm) {
    if (typeof raioKm !== 'number' || !isFinite(raioKm) || raioKm <= 0 || raioKm > 100) {
      throw AppError.badRequest('raio deve ser um número entre 0 e 100 km.');
    }
  }

  /**
   * Valida limit de resultados. Lança AppError(400) se inválido.
   * @param {number} limit
   */
  static #validarLimit(limit) {
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw AppError.badRequest('limit deve ser um inteiro entre 1 e 100.');
    }
  }
}

module.exports = BarbeariaService;
