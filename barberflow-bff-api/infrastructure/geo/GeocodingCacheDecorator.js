'use strict';

const { IReverseGeocoder } = require('../../domain/geo/ports/IReverseGeocoder');
const { Geohash }          = require('../../domain/geo/value-objects/Geohash');
const { Result }           = require('../../domain/shared/Result');
const GeoConfig            = require('../../config/geo');

// =============================================================
// GeocodingCacheDecorator — Decorator de cache Redis sobre
// IReverseGeocoder.
//
// Chave de cache: bf:geocode:{geohash-p7}
// TTL: 7 dias (GEOCODE_TTL_SECONDS)
//
// Geohash precisão 7 → célula de ~76m — adequado para endereço.
// Coordenadas na mesma célula retornam o mesmo resultado cacheado,
// economizando chamadas à Nominatim.
// =============================================================

/** Precisão do geohash para a chave de cache (76m de resolução) */
const CACHE_PRECISION = 7;

class GeocodingCacheDecorator extends IReverseGeocoder {
  /** @type {IReverseGeocoder} */
  #geocoder;

  /** @type {import('ioredis').Redis} */
  #redis;

  /**
   * @param {{ geocoder: IReverseGeocoder, redisClient: import('ioredis').Redis }} deps
   */
  constructor({ geocoder, redisClient }) {
    super();
    if (!geocoder)    throw new TypeError('GeocodingCacheDecorator: geocoder é obrigatório');
    if (!redisClient) throw new TypeError('GeocodingCacheDecorator: redisClient é obrigatório');

    this.#geocoder = geocoder;
    this.#redis    = redisClient;
  }

  /**
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<Result<{ display_name: string, city: string|null, country: string|null }|null, string>>}
   */
  async reverseGeocode(lat, lng) {
    const cacheKey = this.#buildKey(lat, lng);

    try {
      const cached = await this.#redis.get(cacheKey);
      if (cached !== null) {
        const parsed = JSON.parse(cached);
        return Result.ok(parsed);
      }
    } catch {
      // Cache indisponível → vai ao geocoder
    }

    const result = await this.#geocoder.reverseGeocode(lat, lng);

    if (result.isOk()) {
      try {
        await this.#redis.set(
          cacheKey,
          JSON.stringify(result.getValue()),
          'EX',
          GeoConfig.GEOCODE_TTL_SECONDS,
        );
      } catch {
        // Falha no cache não deve bloquear a resposta
      }
    }

    return result;
  }

  // ── Internos ───────────────────────────────────────────────────

  /**
   * Constrói a chave de cache a partir de geohash precisão 7.
   * @param {number} lat
   * @param {number} lng
   * @returns {string}
   */
  #buildKey(lat, lng) {
    const ghResult = Geohash.encode({ lat, lng, precision: CACHE_PRECISION });
    if (ghResult.isFail()) {
      // Fallback determinístico se encode falhar (ex: coordenada inválida)
      return `${GeoConfig.REDIS_GEOCODE_PREFIX}${lat.toFixed(4)}_${lng.toFixed(4)}`;
    }
    return `${GeoConfig.REDIS_GEOCODE_PREFIX}${ghResult.getValue().value}`;
  }
}

module.exports = { GeocodingCacheDecorator };
