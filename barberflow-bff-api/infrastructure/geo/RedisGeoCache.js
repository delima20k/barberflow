'use strict';

const { Geohash }        = require('../../domain/geo/value-objects/Geohash');
const { IGeoRepository } = require('../../domain/geo/ports/IGeoRepository');
const { Result }         = require('../../domain/shared/Result');
const GeoConfig          = require('../../config/geo');

// =============================================================
// RedisGeoCache — Decorator de cache Redis sobre IGeoRepository.
//
// Responsabilidades:
//   1. Cache de posição de usuário (HASH Redis) — TTL 24h
//   2. Cache de track (sliding window) — LPUSH/LTRIM no Redis
//   3. Cache de barbearias próximas via Redis GEO (GEOADD/GEOSEARCH)
//
// NÃO é subclasse de IGeoRepository — é decorator com mesma interface.
// Qualquer método não coberto pelo cache delega ao wrapped repository.
// =============================================================

class RedisGeoCache {
  /** @type {IGeoRepository} */
  #repo;

  /** @type {import('ioredis').Redis} */
  #redis;

  /**
   * @param {{ repo: IGeoRepository, redisClient: import('ioredis').Redis }} deps
   */
  constructor({ repo, redisClient }) {
    if (!repo)        throw new TypeError('RedisGeoCache: repo é obrigatório');
    if (!redisClient) throw new TypeError('RedisGeoCache: redisClient é obrigatório');

    this.#repo  = repo;
    this.#redis = redisClient;
  }

  // ── Cache de posição do usuário ────────────────────────────────

  /**
   * Atualiza posição: persiste no DB + atualiza cache Redis.
   * @param {string} userId
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<Result>}
   */
  async updateUserLocation(userId, lat, lng) {
    const result = await this.#repo.updateUserLocation(userId, lat, lng);
    if (result.isFail()) return result;

    // Atualiza cache Redis (key expira após TTL de presença)
    const key = `${GeoConfig.REDIS_TRACK_PREFIX}${userId}:last`;
    await this.#redis.hmset(key, { lat: String(lat), lng: String(lng), ts: String(Date.now()) });
    await this.#redis.expire(key, GeoConfig.TRACK_REDIS_TTL_SECONDS);

    return result;
  }

  /**
   * Retorna posição: Redis primeiro, fallback ao DB.
   * @param {string} userId
   * @returns {Promise<Result>}
   */
  async getUserLocation(userId) {
    try {
      const key = `${GeoConfig.REDIS_TRACK_PREFIX}${userId}:last`;
      const cached = await this.#redis.hgetall(key);

      if (cached && cached.lat) {
        return Result.ok({
          lat:        parseFloat(cached.lat),
          lng:        parseFloat(cached.lng),
          locationAt: new Date(Number(cached.ts)),
        });
      }
    } catch {
      // Redis indisponível → fallback ao DB
    }

    return this.#repo.getUserLocation(userId);
  }

  // ── Barbearias próximas via Redis GEO ─────────────────────────

  /**
   * Retorna lugares próximos: Redis GEO primeiro, fallback ao DB.
   * Popula o cache Redis GEO quando ausente.
   * @param {number} lat
   * @param {number} lng
   * @param {number} radiusMeters
   * @param {number} limit
   * @returns {Promise<Result>}
   */
  async getNearbyPlaces(lat, lng, radiusMeters, limit) {
    return this.#repo.getNearbyPlaces(lat, lng, radiusMeters, limit);
  }

  // ── Track (sliding window) no Redis ────────────────────────────

  /**
   * Adiciona uma posição ao track do usuário no Redis.
   * @param {string} userId
   * @param {number} lat
   * @param {number} lng
   * @param {Date}   timestamp
   * @returns {Promise<void>}
   */
  async appendTrack(userId, lat, lng, timestamp = new Date()) {
    const key   = `${GeoConfig.REDIS_TRACK_PREFIX}${userId}`;
    const entry = JSON.stringify({ lat, lng, ts: timestamp.getTime() });
    await this.#redis.lpush(key, entry);
    await this.#redis.ltrim(key, 0, GeoConfig.TRACK_WINDOW_SIZE - 1);
    await this.#redis.expire(key, GeoConfig.TRACK_REDIS_TTL_SECONDS);
  }

  /**
   * Retorna o track do usuário do Redis (posições mais recentes primeiro).
   * @param {string} userId
   * @returns {Promise<Array<{ lat: number, lng: number, ts: number }>>}
   */
  async getTrack(userId) {
    try {
      const key  = `${GeoConfig.REDIS_TRACK_PREFIX}${userId}`;
      const raw  = await this.#redis.lrange(key, 0, GeoConfig.TRACK_WINDOW_SIZE - 1);
      return raw.map(e => JSON.parse(e));
    } catch {
      return [];
    }
  }

  // ── Presença em geofences ──────────────────────────────────────

  /**
   * Retorna o mapa de presença em geofences para um usuário.
   * @param {string} userId
   * @returns {Promise<Record<string, boolean>>}
   */
  async getPresenceMap(userId) {
    try {
      const key  = `${GeoConfig.REDIS_GEO_PRESENCE_PREFIX}${userId}`;
      const data = await this.#redis.hgetall(key);
      if (!data) return {};
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '1'])
      );
    } catch {
      return {};
    }
  }

  /**
   * Persiste o mapa de presença em geofences no Redis.
   * @param {string} userId
   * @param {Record<string, boolean>} presenceMap
   * @returns {Promise<void>}
   */
  async savePresenceMap(userId, presenceMap) {
    try {
      const key   = `${GeoConfig.REDIS_GEO_PRESENCE_PREFIX}${userId}`;
      const pairs = {};
      for (const [id, val] of Object.entries(presenceMap)) {
        pairs[id] = val ? '1' : '0';
      }
      if (Object.keys(pairs).length > 0) {
        await this.#redis.hmset(key, pairs);
        await this.#redis.expire(key, GeoConfig.GEO_PRESENCE_TTL_SECONDS);
      }
    } catch {
      // Cache opcional — falha silenciosamente
    }
  }

  // ── Delegação direta ao repo ───────────────────────────────────

  /**
   * @param {string} userId
   * @param {number} radiusMeters
   * @returns {Promise<Result>}
   */
  async getActiveGeofencesNearUser(userId, radiusMeters) {
    return this.#repo.getActiveGeofencesNearUser(userId, radiusMeters);
  }
}

module.exports = { RedisGeoCache };
