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

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
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
    BarbershopPublicCacheProvider.#upstashClient ??= new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    return new UpstashRestCache({ redisClient: BarbershopPublicCacheProvider.#upstashClient });
  }
}

module.exports = { BarbershopPublicCacheProvider };
