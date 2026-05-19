'use strict';

const BaseController = require('./BaseController');
const AppError       = require('../utils/AppError');

/**
 * GeoController — Endpoints autenticados de localização GPS do usuário.
 *
 * Rotas (auth obrigatória via AuthMiddleware):
 *   PATCH /api/v1/clientes/localizacao  — salva posição GPS
 *   GET   /api/v1/clientes/localizacao  — retorna última posição salva (ou null)
 *
 * Camada: interfaces
 */
class GeoController extends BaseController {

  /** @type {import('../services/GeoService')} */
  #svc;

  /** @param {import('../services/GeoService')} svc */
  constructor(svc) {
    super();
    this.#svc = svc;
  }

  // ── Handlers ─────────────────────────────────────────────────

  /**
   * PATCH /api/v1/clientes/localizacao
   * Body: { lat: number, lng: number }
   */
  async patch(req, res) {
    await this.handle(res, async () => {
      const { lat, lng } = req.body ?? {};

      if (lat == null) throw AppError.badRequest("Campo 'lat' é obrigatório.");
      if (lng == null) throw AppError.badRequest("Campo 'lng' é obrigatório.");

      const latN = Number(lat);
      const lngN = Number(lng);

      if (!isFinite(latN)) throw AppError.badRequest("Campo 'lat' deve ser numérico.");
      if (!isFinite(lngN)) throw AppError.badRequest("Campo 'lng' deve ser numérico.");
      if (latN < -90  || latN > 90)  throw AppError.badRequest("Campo 'lat' deve estar entre -90 e 90.");
      if (lngN < -180 || lngN > 180) throw AppError.badRequest("Campo 'lng' deve estar entre -180 e 180.");

      await this.#svc.salvar(req.user.id, latN, lngN);
      this.success(res);
    });
  }

  /**
   * GET /api/v1/clientes/localizacao
   * Retorna { lat, lng } ou null (dados: null) se inexistente/expirado.
   */
  async get(req, res) {
    await this.handle(res, async () => {
      const pos = await this.#svc.carregar(req.user.id);
      this.success(res, pos);
    });
  }
}

module.exports = GeoController;
