'use strict';

const { RedisCache } = require('./RedisCache');

class BarbershopPublicCacheProvider {
  static #redisClient = null;

  static create() {
    if (process.env.CACHE_DRIVER !== 'redis' || !process.env.REDIS_URL) {
      return null;
    }

    const Redis = require('ioredis'); // eslint-disable-line global-require
    BarbershopPublicCacheProvider.#redisClient ??= new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    });

    return new RedisCache({ redisClient: BarbershopPublicCacheProvider.#redisClient });
  }
}

module.exports = { BarbershopPublicCacheProvider };
