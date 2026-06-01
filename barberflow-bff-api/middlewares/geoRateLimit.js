'use strict';

const GeoConfig = require('../config/geo');

// =============================================================
// geoRateLimit — Middleware Express de rate-limit por userId.
//
// Estratégia: Redis INCR + PEXPIRE
//   1 request por GEO_RL_WINDOW_MS ms por usuário.
//   Chave: bf:geo-rl:{userId}
//
// Se Redis não estiver disponível, deixa passar (fail-open)
// para não degradar a UX em caso de falha de cache.
// =============================================================

class GeoRateLimiter {
  /** @type {object|null} */ #redis;
  /** @type {number}      */ #windowMs;
  /** @type {number}      */ #max;
  /** @type {string}      */ #prefix;

  /**
   * @param {object|null} redis  — instância ioredis (pode ser null)
   */
  constructor(redis) {
    this.#redis    = redis ?? null;
    this.#windowMs = GeoConfig.GEO_RL_WINDOW_MS;
    this.#max      = GeoConfig.GEO_RL_MAX;
    this.#prefix   = GeoConfig.REDIS_GEO_RL_PREFIX;
  }

  /**
   * Retorna middleware Express.
   * @returns {Function}
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.#redis) return next(); // fail-open sem Redis

      const userId = req.user?.id ?? req.headers['x-user-id'];
      if (!userId) return next(); // sem identidade → não limitar

      const key = `${this.#prefix}${userId}`;

      try {
        const count = await this.#redis.incr(key);
        if (count === 1) {
          await this.#redis.pexpire(key, this.#windowMs);
        }
        if (count > this.#max) {
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `Limite de ${this.#max} atualização(ões) a cada ${this.#windowMs}ms atingido.`,
          });
        }
        next();
      } catch {
        // fail-open: Redis indisponível
        next();
      }
    };
  }
}

module.exports = { GeoRateLimiter };
