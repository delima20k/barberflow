'use strict';

const { IDistanceStrategy } = require('../../domain/geo/ports/IDistanceStrategy');

// =============================================================
// HaversineStrategy — Calcula distância esférica entre dois pontos
// WGS-84 usando a fórmula Haversine.
//
// Precisão: ~0.5% de erro (adequado para UX de proximidade).
// Complexidade: O(1), sem iterações.
// =============================================================

const EARTH_RADIUS_M = 6371000;

class HaversineStrategy extends IDistanceStrategy {

  /** @returns {string} */
  get name() { return 'haversine'; }

  /**
   * @param {{ lat: number, lng: number }} from
   * @param {{ lat: number, lng: number }} to
   * @returns {number} Distância em metros
   */
  calculateMeters(from, to) {
    const toRad = deg => (deg * Math.PI) / 180;

    const dLat  = toRad(to.lat - from.lat);
    const dLng  = toRad(to.lng - from.lng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);

    const a = sinLat * sinLat +
      Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * sinLng * sinLng;

    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
  }
}

module.exports = { HaversineStrategy };
