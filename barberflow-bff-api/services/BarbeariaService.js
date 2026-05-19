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

    try {
      const rows = await this.#repo.getNearby(lat, lng, raioKm);
      return rows.map(row => ({
        ...row,
        distancia_km: row.distancia_m != null ? row.distancia_m / 1000 : null,
      }));
    } catch (err) {
      console.warn('[BarbeariaService] listarProximas: banco indisponível —', err.message);
      return [];
    }
  }

  /**
   * Lista barbearias em destaque (top rated).
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async listarDestaque(limit = 6) {
    BarbeariaService.#validarLimit(limit);
    try {
      return await this.#repo.getFeatured(limit);
    } catch (err) {
      console.warn('[BarbeariaService] listarDestaque: banco indisponível —', err.message);
      return [];
    }
  }

  /**
   * Lista todas as barbearias ativas por popularidade.
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  async listarTodas(limit = 60) {
    BarbeariaService.#validarLimit(limit);
    try {
      return await this.#repo.getAll(limit);
    } catch (err) {
      console.warn('[BarbeariaService] listarTodas: banco indisponível —', err.message);
      return [];
    }
  }

  /**
   * Salva endereco completo e coordenadas da barbearia do usuario autenticado.
   * @param {string} userId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async salvarEndereco(userId, dados = {}) {
    this._uuid('userId', userId);

    const lat = Number(dados.lat);
    const lng = Number(dados.lng);
    this._coordenada(lat, lng);

    const rua = this._texto('address', dados.address, 160, true);
    const numero = this._texto('numero', dados.numero ?? '', 30, false);
    const complemento = this._texto('complemento', dados.complemento ?? '', 80, false);
    const city = this._texto('city', dados.city ?? '', 80, false);
    const state = this._texto('state', dados.state ?? '', 2, false).toUpperCase();
    const zipCode = this._texto('zip_code', dados.zip_code ?? dados.zipCode ?? '', 12, false);
    const neighborhood = this._texto('neighborhood', dados.neighborhood ?? '', 80, false);
    const address = [rua, numero, complemento].filter(Boolean).join(', ');

    return this.#repo.updateEndereco(userId, {
      address,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      neighborhood: neighborhood || null,
      latitude: lat,
      longitude: lng,
      updated_at: new Date().toISOString(),
    });
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
