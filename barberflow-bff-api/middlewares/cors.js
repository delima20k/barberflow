'use strict';

const config = require('../config');

/**
 * CorsMiddleware — CORS configurado para o BFF BarberFlow.
 *
 * Origens permitidas por ambiente (via config/environments/).
 * Cobre o app cliente e o app profissional.
 * Aceita também qualquer subdomínio *.vercel.app para previews de PR.
 *
 * Retorna 200 para OPTIONS (padrão CORS — browser ignora resposta sem headers).
 * Headers CORS só são setados se a origem for permitida.
 */
class CorsMiddleware {

  static #allowedOrigins = new Set([
    ...config.cors.allowedOrigins,
    ...(process.env.CORS_EXTRA_ORIGINS
      ? process.env.CORS_EXTRA_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
      : []),
  ]);

  static #isProducao = process.env.APP_ENV === 'production';

  /**
   * Verifica se a origem é permitida.
   * @param {string|undefined} origin
   * @returns {boolean}
   */
  static #isAllowed(origin) {
    if (!origin) return false;
    if (CorsMiddleware.#allowedOrigins.has(origin)) return true;
    // Previews de PR via Vercel — permitido apenas fora de produção.
    // Em produção, somente origens explícitas de config/environments/production.js.
    if (!CorsMiddleware.#isProducao) {
      try {
        return new URL(origin).hostname.endsWith('.vercel.app');
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Middleware Express: seta headers CORS e responde OPTIONS imediatamente.
   * @type {import('express').RequestHandler}
   */
  static handle(req, res, next) {
    const origin = req.headers.origin;

    if (CorsMiddleware.#isAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin',      origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey,x-client-info');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    return next();
  }
}

module.exports = CorsMiddleware;
