'use strict';

// =============================================================
// IGeoRepository — Port (interface) do repositório de geolocalização.
//
// Implementações concretas:
//   - PostGISGeoRepository  (produção — Supabase + PostGIS)
//   - InMemoryGeoRepository (testes de integração)
// =============================================================

/**
 * @interface
 */
class IGeoRepository {
  /**
   * Persiste a localização do usuário e retorna a posição anterior.
   *
   * @param {string} userId
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<import('../../shared/Result').Result<
   *   { prevLat: number|null, prevLng: number|null, prevLocationAt: Date|null },
   *   string
   * >>}
   */
  async updateUserLocation(userId, lat, lng) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.updateUserLocation() não implementado`);
  }

  /**
   * Retorna a última posição conhecida do usuário.
   *
   * @param {string} userId
   * @returns {Promise<import('../../shared/Result').Result<
   *   { lat: number, lng: number, locationAt: Date }|null,
   *   string
   * >>}
   */
  async getUserLocation(userId) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.getUserLocation() não implementado`);
  }

  /**
   * Retorna geofences ativas próximas ao usuário dentro de um raio.
   *
   * @param {string} userId
   * @param {number} radiusMeters
   * @returns {Promise<import('../../shared/Result').Result<import('../entities/GeoFence').GeoFence[], string>>}
   */
  async getActiveGeofencesNearUser(userId, radiusMeters) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.getActiveGeofencesNearUser() não implementado`);
  }

  /**
   * Retorna lugares (barbearias) próximos a uma coordenada.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} radiusMeters
   * @param {number} limit
   * @returns {Promise<import('../../shared/Result').Result<import('../entities/Place').Place[], string>>}
   */
  async getNearbyPlaces(lat, lng, radiusMeters, limit) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.getNearbyPlaces() não implementado`);
  }
}

module.exports = { IGeoRepository };
