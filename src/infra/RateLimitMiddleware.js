'use strict';

// =============================================================
// RateLimitMiddleware.js — Rate limiting por IP.
// Camada: infra
//
// Protege contra brute-force, DDoS e abuso de API.
// Usa express-rate-limit (em memória — para múltiplas instâncias,
// substituir store por RedisStore).
//
// Limites:
//   - Geral:      300 req / 1 min por IP
//   - Auth:        10 req / 15 min por IP (login/cadastro)
//   - Escrita:     60 req / 1 min por IP  (POST/PATCH/DELETE)
// =============================================================

const rateLimit = require('express-rate-limit');
const logger    = require('./LoggerService');

class RateLimitMiddleware {

  /** @param {import('express').Request} req @param {import('express').Response} res */
  static #onLimitReached(req, res) {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit atingido');
    res.status(429).json({
      ok:    false,
      error: 'Muitas requisições. Tente novamente em instantes.',
    });
  }

  /** Limiter geral — todas as rotas /api/*. 300 req/min por IP. */
  static geral = rateLimit({
    windowMs:        60 * 1000,
    max:             300,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    handler:         (req, res) => RateLimitMiddleware.#onLimitReached(req, res),
    skip:            (req) => req.method === 'GET' && req.path === '/api/health',
  });

  /** Limiter de autenticação — login, cadastro, recuperação. 10 req/15min por IP. */
  static auth = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    handler:         (req, res) => RateLimitMiddleware.#onLimitReached(req, res),
  });

  /** Limiter de escrita — POST / PATCH / DELETE (exceto auth). 60 req/min por IP. */
  static escrita = rateLimit({
    windowMs:        60 * 1000,
    max:             60,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    handler:         (req, res) => RateLimitMiddleware.#onLimitReached(req, res),
    skip:            (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  });
}

module.exports = RateLimitMiddleware;
