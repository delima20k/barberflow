'use strict';

const { CacheKeyBuilder } = require('../cache/CacheKeyBuilder');
const { CACHE_TTL } = require('../../config/cacheTtl');

class FeedCache {
  #cache;

  constructor({ cache }) {
    if (!cache) throw new TypeError('FeedCache: cache obrigatorio.');
    this.#cache = cache;
  }

  async get(query) {
    return this.#cache.get(this.#key(query));
  }

  async set(query, page) {
    await this.#cache.set(this.#key(query), page, CACHE_TTL.FEED_TIMELINE);
  }

  async invalidateUser(userId) {
    await this.#cache.delByPrefix(CacheKeyBuilder.prefix('feed', `timeline:${userId}`));
  }

  async invalidateAll() {
    await this.#cache.delByPrefix(CacheKeyBuilder.prefix('feed', 'timeline'));
  }

  #key(query) {
    return CacheKeyBuilder.buildList('feed', `timeline:${query.userId}`, {
      cursor: query.cursor ? `${query.cursor.createdAt}:${query.cursor.id}` : 'head',
      limit: query.limit,
      strategy: query.strategy,
    }, 'v1');
  }
}

module.exports = { FeedCache };
