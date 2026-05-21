'use strict';

const { ICache } = require('./ICache');

/**
 * RedisCache — Implementação do ICache via Redis (ioredis).
 *
 * Valores são serializados como JSON.
 * TTL 0 significa "sem expiração".
 */
class RedisCache extends ICache {
  /** @type {import('ioredis').Redis} */
  #redis;

  /**
   * @param {{ redisClient: import('ioredis').Redis }} deps
   */
  constructor({ redisClient }) {
    super();
    if (!redisClient) throw new Error('RedisCache: redisClient é obrigatório');
    this.#redis = redisClient;
  }

  async get(key) {
    const raw = await this.#redis.get(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  async set(key, value, ttlSeconds) {
    const serialized = JSON.stringify(value);
    if (ttlSeconds != null && ttlSeconds > 0) {
      await this.#redis.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.#redis.set(key, serialized);
    }
  }

  async del(key) {
    await this.#redis.del(key);
  }

  async delByPrefix(prefix) {
    // Usa SCAN para não bloquear o event loop (KEYS é proibido em produção)
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.#redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) await this.#redis.del(...keys);
    } while (cursor !== '0');
  }

  async flush() {
    await this.#redis.flushdb();
  }
}

module.exports = { RedisCache };
