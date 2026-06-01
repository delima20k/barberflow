'use strict';

const { Coordinate } = require('../../domain/geo/value-objects/Coordinate');
const { Result }     = require('../../domain/shared/Result');
const GeoConfig      = require('../../config/geo');

// =============================================================
// GetNearbyPlacesUseCase
// Busca barbearias/POIs próximas a uma coordenada.
// =============================================================

class GetNearbyPlacesUseCase {
  /** @type {object} */ #geoRepository;
  /** @type {number} */ #defaultLimit;

  /**
   * @param {object} deps
   * @param {object} deps.geoRepository
   */
  constructor({ geoRepository }) {
    this.#geoRepository = geoRepository;
    this.#defaultLimit  = GeoConfig.MAX_NEARBY_LIMIT ?? 20;
  }

  /**
   * @param {object} params
   * @param {number} params.lat
   * @param {number} params.lng
   * @param {number} params.radiusKm
   * @param {number} [params.limit]
   * @returns {Promise<Result>}
   */
  async execute({ lat, lng, radiusKm, limit } = {}) {
    // --- validar coordinate ---
    const coordResult = Coordinate.create({ lat, lng });
    if (coordResult.isFail()) return Result.fail(coordResult.getError());

    // --- validar raio ---
    if (typeof radiusKm !== 'number' || !isFinite(radiusKm) || radiusKm <= 0) {
      return Result.fail('raio (radiusKm) deve ser um número maior que zero');
    }

    const radiusMeters = radiusKm * 1000;
    const coord        = coordResult.getValue();

    try {
      const places = await this.#geoRepository.getNearbyPlaces({
        lat:          coord.lat,
        lng:          coord.lng,
        radiusMeters,
        limit:        typeof limit === 'number' && limit > 0 ? limit : this.#defaultLimit,
      });

      return Result.ok(places ?? []);
    } catch (err) {
      return Result.fail(err.message);
    }
  }
}

module.exports = { GetNearbyPlacesUseCase };
