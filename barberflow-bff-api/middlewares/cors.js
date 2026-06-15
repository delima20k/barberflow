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
  static #ALLOW_HEADERS = 'Content-Type,Authorization,apikey,x-client-info,X-BarberFlow-Diagnostics';
  static #EXPOSE_HEADERS = 'X-Chat-Diagnostics,X-Appointment-Diagnostics,Server-Timing,X-Request-Id,X-Correlation-Id';

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
    // Previews de PR via Vercel — restrito a subdomínios do próprio projeto.
    // Regex garante que só hostnames com prefixo barberflow/berberflow são aceitos —
    // evita que qualquer app de terceiro em *.vercel.app faça requisições cross-origin.
    if (!CorsMiddleware.#isProducao) {
      try {
        const { hostname } = new URL(origin);
        return hostname.endsWith('.vercel.app') && /^barb[e]rflow[-.]/i.test(hostname);
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

    // Vary: Origin e no-store em TODAS as respostas (inclusive bloqueadas).
    // Impede CDN de cachear uma resposta de uma origin e servi-la para outra —
    // o 304 retornado pela CDN pode trazer Access-Control-Allow-Origin errado.
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Surrogate-Control', 'no-store');

    if (CorsMiddleware.#isAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin',      origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', CorsMiddleware.#EXPOSE_HEADERS);
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', CorsMiddleware.#ALLOW_HEADERS);
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    return next();
  }
}

module.exports = CorsMiddleware;
