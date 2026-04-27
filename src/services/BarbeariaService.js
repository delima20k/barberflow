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

class BarbeariaService {

  #barbeariaRepository;

  /** @param {import('../repositories/BarbeariaRepository')} barbeariaRepository */
  constructor(barbeariaRepository) {
    this.#barbeariaRepository = barbeariaRepository;
  }

  /**
   * Busca uma barbearia pelo ID.
   * @param {string} id
   * @returns {Promise<Barbearia>}
   */
  async buscarBarbearia(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const row = await this.#barbeariaRepository.getById(id);
    if (!row) throw Object.assign(new Error('Barbearia não encontrada.'), { status: 404 });

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
    if (!rCoord.ok) throw Object.assign(new Error(rCoord.msg), { status: 400 });

    if (typeof raioKm !== 'number' || !isFinite(raioKm) || raioKm <= 0 || raioKm > 100)
      throw Object.assign(new Error('raioKm deve ser um número entre 0 e 100.'), { status: 400 });

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
    const rId = InputValidator.uuid(barbeariaId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#barbeariaRepository.getServicos(barbeariaId);
  }

  /**
   * Lista as barbearias favoritadas pelo usuário.
   * @param {string} userId
   * @returns {Promise<Barbearia[]>}
   */
  async listarFavoritas(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

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
    const rBid = InputValidator.uuid(barbeariaId);
    if (!rBid.ok) throw Object.assign(new Error(rBid.msg), { status: 400 });
    const rUid = InputValidator.uuid(userId);
    if (!rUid.ok) throw Object.assign(new Error(rUid.msg), { status: 400 });

    const tiposValidos = ['like', 'favorite', 'visit'];
    const rTipo = InputValidator.enumValido(tipo, tiposValidos);
    if (!rTipo.ok) throw Object.assign(new Error(rTipo.msg), { status: 400 });

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
