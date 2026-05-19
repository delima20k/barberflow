'use strict';

const BaseController = require('./BaseController');

/**
 * HealthController — GET /health
 *
 * Retorna o status operacional do BFF.
 * Rota pública — sem autenticação.
 *
 * Resposta:
 *   { ok: true, dados: { status: "up", version: "1.0.0", env: "development", timestamp: ISO } }
 */
class HealthController extends BaseController {

  static #VERSION = '1.0.0';

  constructor() {
    super();
  }

  /**
   * @param {import('express').Request}  _req
   * @param {import('express').Response} res
   */
  handle(_req, res) {
    this.success(res, {
      status:    'up',
      version:   HealthController.#VERSION,
      env:       (process.env.APP_ENV ?? 'development').trim(),
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = HealthController;
