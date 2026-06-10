'use strict';

const { ICache } = require('./ICache');

class UpstashRestCache extends ICache {
  #redis;

  constructor({ redisClient }) {
    super();
    if (!redisClient) throw new Error('UpstashRestCache: redisClient e obrigatorio');
    this.#redis = redisClient;
  }

  async get(key) {
    const raw = await this.#redis.get(key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  async set(key, value, ttlSeconds) {
    const serialized = JSON.stringify(value);
    if (ttlSeconds != null && ttlSeconds > 0) {
      await this.#redis.set(key, serialized, { ex: ttlSeconds });
      return;
    }
    await this.#redis.set(key, serialized);
  }

  async del(key) {
    await this.#redis.del(key);
  }

  async delByPrefix(_prefix) {
    throw new Error('UpstashRestCache.delByPrefix nao suportado neste adapter');
  }

  async flush() {
    throw new Error('UpstashRestCache.flush nao suportado neste adapter');
  }
}

module.exports = { UpstashRestCache };
