'use strict';

const { MemoryCache } = require('../cache/MemoryCache');
const { RedisCache } = require('../cache/RedisCache');
const { FeedCache } = require('./FeedCache');

class FeedCacheProvider {
  static #redisClient = null;

  static create() {
    if (process.env.CACHE_DRIVER === 'redis' && process.env.REDIS_URL) {
      const Redis = require('ioredis'); // eslint-disable-line global-require
      FeedCacheProvider.#redisClient ??= new Redis(process.env.REDIS_URL, { lazyConnect: true });
      return new FeedCache({ cache: new RedisCache({ redisClient: FeedCacheProvider.#redisClient }) });
    }
    return new FeedCache({ cache: new MemoryCache() });
  }
}

module.exports = { FeedCacheProvider };
