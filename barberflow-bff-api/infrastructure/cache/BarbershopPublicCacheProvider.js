'use strict';

const { RedisCache } = require('./RedisCache');
const { UpstashRestCache } = require('./UpstashRestCache');

class BarbershopPublicCacheProvider {
  static #redisClient = null;
  static #upstashClient = null;

  static create() {
    if (process.env.REDIS_URL) {
      return BarbershopPublicCacheProvider.#createRedisUrlCache();
    }

    const upstashConfig = BarbershopPublicCacheProvider.#getUpstashConfig();
    if (upstashConfig) {
      return BarbershopPublicCacheProvider.#createUpstashCache();
    }

    return null;
  }

  static #createRedisUrlCache() {
    const Redis = require('ioredis'); // eslint-disable-line global-require
    BarbershopPublicCacheProvider.#redisClient ??= new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    });

    return new RedisCache({ redisClient: BarbershopPublicCacheProvider.#redisClient });
  }

  static #createUpstashCache() {
    const { Redis } = require('@upstash/redis'); // eslint-disable-line global-require
    const { url, token } = BarbershopPublicCacheProvider.#getUpstashConfig();
    BarbershopPublicCacheProvider.#upstashClient ??= new Redis({
      url,
      token,
    });

    return new UpstashRestCache({ redisClient: BarbershopPublicCacheProvider.#upstashClient });
  }

  static #getUpstashConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return { url, token };
  }
}

module.exports = { BarbershopPublicCacheProvider };
