'use strict';

const { IReverseGeocoder } = require('../../domain/geo/ports/IReverseGeocoder');
const { Result }           = require('../../domain/shared/Result');

// =============================================================
// NominatimGeocoderAdapter — Adapter para OSM Nominatim API.
//
// Throttle obrigatório: 1 req/s (política de uso da Nominatim).
// User-Agent obrigatório: identifica a aplicação para a Nominatim.
//
// Em produção, o GeocodingCacheDecorator DEVE estar na frente
// para evitar chamadas desnecessárias e respeitar o rate limit.
// =============================================================

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1000; // 1 req/s — obrigatório pela política da Nominatim

class NominatimGeocoderAdapter extends IReverseGeocoder {
  /** @type {string} */
  #userAgent;

  /** @type {number} Timestamp da última requisição */
  #lastRequestAt;

  /**
   * @param {object} params
   * @param {string} params.userAgent - ex: "BarberFlow/1.0 (contact@barberflow.com)"
   */
  constructor({ userAgent = 'BarberFlow/1.0 (geocoder)' } = {}) {
    super();
    this.#userAgent    = userAgent;
    this.#lastRequestAt = 0;
  }

  /**
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<Result<{ display_name: string, city: string|null, country: string|null }|null, string>>}
   */
  async reverseGeocode(lat, lng) {
    await this.#throttle();

    try {
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': this.#userAgent,
          'Accept':     'application/json',
        },
      });

      if (res.status === 404) return Result.ok(null);

      if (!res.ok) {
        return Result.fail(`NominatimGeocoderAdapter: HTTP ${res.status} para (${lat}, ${lng})`);
      }

      const data = await res.json();

      if (!data || !data.display_name) return Result.ok(null);

      return Result.ok({
        display_name: data.display_name,
        city:    data.address?.city   ?? data.address?.town  ?? data.address?.village ?? null,
        country: data.address?.country ?? null,
      });
    } catch (err) {
      return Result.fail(`NominatimGeocoderAdapter: ${err.message}`);
    }
  }

  // ── Throttle ───────────────────────────────────────────────────

  /**
   * Garante que no máximo 1 requisição por segundo seja feita.
   * @returns {Promise<void>}
   */
  async #throttle() {
    const now    = Date.now();
    const elapsed = now - this.#lastRequestAt;

    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
    }

    this.#lastRequestAt = Date.now();
  }
}

module.exports = { NominatimGeocoderAdapter };
