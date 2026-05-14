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
   * Lista barbearias próximas aplicando filtro Haversine.
   * @param {number} lat
   * @param {number} lng
   * @param {number} [raioKm=5]
   * @returns {Promise<object[]>}
   */
  async listarProximas(lat, lng, raioKm = 5) {
    this._coordenada(lat, lng);
    BarbeariaService.#validarRaio(raioKm);

    const latDelta = raioKm / 111.0;
    const lngDelta = raioKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const rows = await this.#repo.getNearby(lat, lng, latDelta, lngDelta);

    return rows
      .map(row => ({
        ...row,
        distancia_km: BarbeariaService.#haversine(lat, lng, row.latitude, row.longitude),
      }))
      .filter(item => item.distancia_km <= raioKm)
      .sort((a, b) => a.distancia_km - b.distancia_km);
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
   * Calcula distância Haversine entre dois pontos em km.
   * @param {number} lat1 @param {number} lng1
   * @param {number} lat2 @param {number} lng2
   * @returns {number}
   */
  static #haversine(lat1, lng1, lat2, lng2) {
    if (lat2 == null || lng2 == null) return Infinity;
    const R  = 6371;
    const dL = (lat2 - lat1) * Math.PI / 180;
    const dO = (lng2 - lng1) * Math.PI / 180;
    const a  = Math.sin(dL / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) *
               Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dO / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

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
