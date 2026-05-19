'use strict';

const rateLimit  = require('express-rate-limit');
const { logger } = require('./logger');

const IS_PROD = process.env.APP_ENV === 'production';

// ── Redis store (Upstash) — compartilhado entre instâncias serverless ──────────
// Sem Redis configurado: MemoryStore padrão (dev/test).
// Com Redis: contadores são globais — rate limit efetivo independente de quantas
// instâncias Vercel estejam rodando.
let _redisStore = null;

function _criarRedisStore() {
  if (_redisStore !== null) return _redisStore;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _redisStore = undefined; return undefined; }

  try {
    // rate-limit-redis + @upstash/redis (REST client, serverless-compatible)
    const { Redis }    = require('@upstash/redis');
    const RedisStore   = require('rate-limit-redis');
    const redis        = new Redis({ url, token });
    _redisStore = new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) });
    logger.info('[BFF] Rate limiter usando Upstash Redis (modo produção)');
  } catch (err) {
    logger.warn({ err }, '[BFF] Upstash Redis indisponível — usando MemoryStore');
    _redisStore = undefined;
  }
  return _redisStore;
}

/**
 * RateLimiterMiddleware — Rate limiting por IP para o BFF.
 *
 * Em produção com UPSTASH_REDIS_REST_URL configurado: usa RedisStore compartilhado
 * entre todas as instâncias serverless (Vercel) — rate limit global e efetivo.
 *
 * Em desenvolvimento/staging ou sem Redis: usa MemoryStore (padrão express-rate-limit).
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
    store:           _criarRedisStore(),
    skip:            (req) => req.method === 'GET' && /\/health$/.test(req.path),
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static auth = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    // Pula fora de produção — o limite é projetado apenas para produção.
    skip:            () => !IS_PROD,
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static escrita = rateLimit({
    windowMs:        60 * 1000,
    max:             60,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    skip:            (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });
}

module.exports = RateLimiterMiddleware;
