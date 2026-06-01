'use strict';

// =============================================================
// IReverseGeocoder — Port para resolução de coordenadas em endereços.
//
// Implementações concretas:
//   - NominatimGeocoderAdapter (OSM Nominatim — throttle 1 req/s)
//   - GeocodingCacheDecorator  (decorator de cache Redis sobre IReverseGeocoder)
// =============================================================

/**
 * @interface
 */
class IReverseGeocoder {
  /**
   * Converte coordenada em endereço legível.
   * Retorna null se não encontrado.
   *
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<import('../../shared/Result').Result<
   *   { display_name: string, city: string|null, country: string|null }|null,
   *   string
   * >>}
   */
  async reverseGeocode(lat, lng) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.reverseGeocode() não implementado`);
  }
}

module.exports = { IReverseGeocoder };
