'use strict';

const rateLimit      = require('express-rate-limit');
const { logger }     = require('./logger');

/**
 * RateLimiterMiddleware — Rate limiting por IP para o BFF.
 *
 * Limites:
 *   geral:   300 req / 1 min   (todas as rotas — exceto health)
 *   auth:     10 req / 15 min  (login, signup, refresh)
 *   escrita:  60 req / 1 min   (POST, PATCH, DELETE)
 */
class RateLimiterMiddleware {

  static #onLimit(req, res) {
    logger.warn({ ip: req.ip, path: req.path }, '[BFF] Rate limit atingido');
    res.status(429).json({ ok: false, error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  static geral = rateLimit({
    windowMs:        60 * 1000,
    max:             300,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    skip:            (req) => req.method === 'GET' && /\/health$/.test(req.path),
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static auth = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static escrita = rateLimit({
    windowMs:        60 * 1000,
    max:             60,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    skip:            (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });
}

module.exports = RateLimiterMiddleware;
