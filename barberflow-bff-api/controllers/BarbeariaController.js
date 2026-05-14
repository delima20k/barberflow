'use strict';

const BaseController = require('./BaseController');
const AppError       = require('../utils/AppError');

/**
 * BarbeariaController — Endpoints públicos de barbearias para o BFF.
 *
 * Rotas (todas públicas — sem autenticação):
 *   GET /api/v1/barbearias?lat=X&lng=Y[&raio=5]     → proximas
 *   GET /api/v1/barbearias/destaque[?limit=6]        → top rated
 *   GET /api/v1/barbearias/todas[?limit=60]          → todas ativas
 *
 * Camada: interfaces
 */
class BarbeariaController extends BaseController {

  /** @type {import('../services/BarbeariaService')} */
  #service;

  /** @param {import('../services/BarbeariaService')} service */
  constructor(service) {
    super();
    this.#service = service;
  }

  // ── Handlers ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/barbearias?lat=X&lng=Y[&raio=5]
   * Lista barbearias próximas à coordenada informada.
   */
  async proximas(req, res) {
    await this.handle(res, async () => {
      const lat   = BarbeariaController.#parseCoord(req.query.lat,  'lat');
      const lng   = BarbeariaController.#parseCoord(req.query.lng,  'lng');
      const raio  = BarbeariaController.#parseLimit(req.query.raio, 'raio', 5, 100, 5);

      const lista = await this.#service.listarProximas(lat, lng, raio);

      this.success(res, lista, { total: lista.length });
    });
  }

  /**
   * GET /api/v1/barbearias/destaque[?limit=6]
   * Lista barbearias em destaque (top rated).
   */
  async destaque(req, res) {
    await this.handle(res, async () => {
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 100, 6);

      const lista = await this.#service.listarDestaque(limit);

      this.success(res, lista, { total: lista.length });
    });
  }

  /**
   * GET /api/v1/barbearias/todas[?limit=60]
   * Lista todas as barbearias ativas.
   */
  async todas(req, res) {
    await this.handle(res, async () => {
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 100, 60);

      const lista = await this.#service.listarTodas(limit);

      this.success(res, lista, { total: lista.length });
    });
  }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Parseia e valida um parâmetro de coordenada da query string.
   * Lança AppError(400) se ausente ou não numérico.
   * @param {string|undefined} valor
   * @param {string}           nome
   * @returns {number}
   */
  static #parseCoord(valor, nome) {
    if (valor === undefined || valor === null || valor === '') {
      throw AppError.badRequest(`Parâmetro '${nome}' é obrigatório.`);
    }
    const num = Number(valor);
    if (!isFinite(num)) {
      throw AppError.badRequest(`Parâmetro '${nome}' deve ser numérico.`);
    }
    return num;
  }

  /**
   * Parseia e valida um parâmetro inteiro opcional com valor padrão.
   * Lança AppError(400) se informado mas inválido.
   * @param {string|undefined} valor
   * @param {string}           nome
   * @param {number}           min
   * @param {number}           max
   * @param {number}           padrao
   * @returns {number}
   */
  static #parseLimit(valor, nome, min, max, padrao) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const num = Number(valor);
    if (!isFinite(num) || !Number.isInteger(num)) {
      throw AppError.badRequest(`Parâmetro '${nome}' deve ser um inteiro.`);
    }
    if (num < min || num > max) {
      throw AppError.badRequest(`Parâmetro '${nome}' deve estar entre ${min} e ${max}.`);
    }
    return num;
  }
}

module.exports = BarbeariaController;
