'use strict';

// =============================================================
// BarbeariaService.js — Regras de negócio para barbearias.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao BarbeariaRepository.
// Aplica filtro Haversine sobre bounding-box, ordenação por distância.
// =============================================================

const Barbearia      = require('../entities/Barbearia');
const InputValidator = require('../infra/InputValidator');
const BaseService    = require('../infra/BaseService');

class BarbeariaService extends BaseService {

  #barbeariaRepository;

  /** @param {import('../repositories/BarbeariaRepository')} barbeariaRepository */
  constructor(barbeariaRepository) {
    super('BarbeariaService');
    this.#barbeariaRepository = barbeariaRepository;
  }

  /**
   * Busca uma barbearia pelo ID.
   * @param {string} id
   * @returns {Promise<Barbearia>}
   */
  async buscarBarbearia(id) {
    this._uuid('id', id);

    const row = await this.#barbeariaRepository.getById(id);
    if (!row) throw this._erro('Barbearia não encontrada.', 404);

    return Barbearia.fromRow(row);
  }

  /**
   * Lista barbearias próximas usando Haversine.
   * @param {number} lat      — latitude do usuário
   * @param {number} lng      — longitude do usuário
   * @param {number} raioKm   — raio máximo em km (padrão: 5)
   * @returns {Promise<Array<{barbearia: Barbearia, distanciaKm: number}>>}
   */
  async listarProximas(lat, lng, raioKm = 5) {
    const rCoord = InputValidator.coordenada(lat, lng);
    if (!rCoord.ok) throw this._erro(rCoord.msg);

    if (typeof raioKm !== 'number' || !isFinite(raioKm) || raioKm <= 0 || raioKm > 100)
      throw this._erro('raioKm deve ser um número entre 0 e 100.');

    // Deltas para bounding-box (aproximação linear)
    const latDelta = raioKm / 111.0;
    const lngDelta = raioKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const rows = await this.#barbeariaRepository.getNearby(lat, lng, latDelta, lngDelta);

    // Filtro Haversine e ordenação por distância
    return rows
      .map(row => ({
        barbearia:   Barbearia.fromRow(row),
        distanciaKm: BarbeariaService.#haversine(lat, lng, row.latitude, row.longitude),
        raw:         row,
      }))
      .filter(item => item.distanciaKm <= raioKm)
      .sort((a, b) => a.distanciaKm - b.distanciaKm);
  }

  /**
   * Retorna os serviços disponíveis de uma barbearia.
   * @param {string} barbeariaId
   * @returns {Promise<object[]>}
   */
  async listarServicos(barbeariaId) {
    this._uuid('barbeariaId', barbeariaId);
    return this.#barbeariaRepository.getServicos(barbeariaId);
  }

  /**
   * Lista as barbearias favoritadas pelo usuário.
   * @param {string} userId
   * @returns {Promise<Barbearia[]>}
   */
  async listarFavoritas(userId) {
    this._uuid('userId', userId);
    const rows = await this.#barbeariaRepository.getFavoritas(userId);
    return rows.filter(Boolean).map(r => Barbearia.fromRow(r));
  }

  /**
   * Registra uma interação (like, favorite, visit) com a barbearia.
   * @param {string} barbeariaId
   * @param {string} userId
   * @param {string} tipo
   * @returns {Promise<object>}
   */
  async registrarInteracao(barbeariaId, userId, tipo) {
    this._uuid('barbeariaId', barbeariaId);
    this._uuid('userId', userId);
    this._enum('tipo', tipo, ['like', 'favorite', 'visit']);
    return this.#barbeariaRepository.addInteracao(barbeariaId, userId, tipo);
  }

  // ── Privados ──────────────────────────────────────────────

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
}

module.exports = BarbeariaService;
