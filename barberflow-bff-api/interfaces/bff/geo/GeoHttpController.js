'use strict';

// =============================================================
// GeoHttpController — Controller HTTP para o bounded context geo.
//
// Métodos:
//  • updateLocation(req, res) — PATCH /api/v1/geo/location
//  • getLocation(req, res)    — GET  /api/v1/geo/location/:userId
//  • getNearbyPlaces(req, res)— GET  /api/v1/geo/nearby
//  • reverseGeocode(req, res) — GET  /api/v1/geo/reverse
// =============================================================

class GeoHttpController {
  /** @type {object} */ #updateUserLocationUseCase;
  /** @type {object} */ #getNearbyPlacesUseCase;
  /** @type {object} */ #reverseGeocodeUseCase;

  /**
   * @param {object} deps
   * @param {object} deps.updateUserLocationUseCase
   * @param {object} deps.getNearbyPlacesUseCase
   * @param {object} deps.reverseGeocodeUseCase
   */
  constructor({ updateUserLocationUseCase, getNearbyPlacesUseCase, reverseGeocodeUseCase }) {
    this.#updateUserLocationUseCase = updateUserLocationUseCase;
    this.#getNearbyPlacesUseCase    = getNearbyPlacesUseCase;
    this.#reverseGeocodeUseCase     = reverseGeocodeUseCase;

    // bind para uso direto como handlers Express
    this.updateLocation  = this.updateLocation.bind(this);
    this.getLocation     = this.getLocation.bind(this);
    this.getNearbyPlaces = this.getNearbyPlaces.bind(this);
    this.reverseGeocode  = this.reverseGeocode.bind(this);
  }

  // -----------------------------------------------------------
  // PATCH /api/v1/geo/location
  // Body: { userId, lat, lng }
  // -----------------------------------------------------------
  async updateLocation(req, res) {
    const { userId, lat, lng } = req.body ?? {};

    const result = await this.#updateUserLocationUseCase.execute({
      userId,
      lat: typeof lat === 'string' ? Number(lat) : lat,
      lng: typeof lng === 'string' ? Number(lng) : lng,
    });

    if (result.isFail()) {
      return res.status(400).json({ error: result.getError() });
    }

    return res.status(200).json(result.getValue());
  }

  // -----------------------------------------------------------
  // GET /api/v1/geo/nearby
  // Query: lat, lng, radiusKm, limit
  // -----------------------------------------------------------
  async getNearbyPlaces(req, res) {
    const { lat, lng, radiusKm, limit } = req.query ?? {};

    const result = await this.#getNearbyPlacesUseCase.execute({
      lat:      Number(lat),
      lng:      Number(lng),
      radiusKm: Number(radiusKm),
      limit:    limit != null ? Number(limit) : undefined,
    });

    if (result.isFail()) {
      return res.status(400).json({ error: result.getError() });
    }

    return res.status(200).json({ places: result.getValue() });
  }

  // -----------------------------------------------------------
  // GET /api/v1/geo/reverse
  // Query: lat, lng
  // -----------------------------------------------------------
  async reverseGeocode(req, res) {
    const { lat, lng } = req.query ?? {};

    const result = await this.#reverseGeocodeUseCase.execute({
      lat: Number(lat),
      lng: Number(lng),
    });

    if (result.isFail()) {
      return res.status(400).json({ error: result.getError() });
    }

    return res.status(200).json({ address: result.getValue() });
  }

  // -----------------------------------------------------------
  // getLocation — reservado para uso futuro / plano completo
  // -----------------------------------------------------------
  async getLocation(req, res) {
    return res.status(501).json({ error: 'Not implemented' });
  }
}

module.exports = { GeoHttpController };
