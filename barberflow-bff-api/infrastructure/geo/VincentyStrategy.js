'use strict';

const { IDistanceStrategy } = require('../../domain/geo/ports/IDistanceStrategy');

// =============================================================
// VincentyStrategy — Calcula distância geodésica usando a fórmula
// de Vincenty (elipsoide WGS-84).
//
// Precisão: sub-milimétrica (0.5 mm no pior caso).
// Complexidade: iterativo, converge em ~5 iterações típicas.
//
// Parâmetros WGS-84:
//   a = 6378137.0 m  (semi-eixo maior)
//   f = 1/298.257223563  (achatamento)
//   b = a(1-f) ≈ 6356752.314245 m (semi-eixo menor)
//
// Referência: Vincenty, T. (1975). "Direct and inverse solutions of
// geodesics on the ellipsoid with application of nested equations".
// Survey Review 23 (176): 88–93.
// =============================================================

// WGS-84 ellipsoid parameters
const a = 6378137.0;
const f = 1 / 298.257223563;
const b = (1 - f) * a;

const MAX_ITERATIONS = 100;
const EPSILON        = 1e-12;

class VincentyStrategy extends IDistanceStrategy {

  /** @returns {string} */
  get name() { return 'vincenty'; }

  /**
   * @param {{ lat: number, lng: number }} from
   * @param {{ lat: number, lng: number }} to
   * @returns {number} Distância em metros
   */
  calculateMeters(from, to) {
    const toRad = deg => (deg * Math.PI) / 180;

    const lat1 = toRad(from.lat);
    const lat2 = toRad(to.lat);
    const L    = toRad(to.lng - from.lng);

    const tanU1 = (1 - f) * Math.tan(lat1);
    const tanU2 = (1 - f) * Math.tan(lat2);
    const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
    const cosU2 = 1 / Math.sqrt(1 + tanU2 * tanU2);
    const sinU1 = tanU1 * cosU1;
    const sinU2 = tanU2 * cosU2;

    let lambda = L;
    let lambdaPrev;
    let sinSigma, cosSigma, sigma, sinAlpha, cosSqAlpha, cos2SigmaM, C;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const sinLambda = Math.sin(lambda);
      const cosLambda = Math.cos(lambda);

      const sinSigmaA = cosU2 * sinLambda;
      const sinSigmaB = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;

      sinSigma    = Math.sqrt(sinSigmaA * sinSigmaA + sinSigmaB * sinSigmaB);
      cosSigma    = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
      sigma       = Math.atan2(sinSigma, cosSigma);
      sinAlpha    = (sinSigma === 0) ? 0 : (cosU1 * cosU2 * sinLambda / sinSigma);
      cosSqAlpha  = 1 - sinAlpha * sinAlpha;
      cos2SigmaM  = (cosSqAlpha === 0) ? 0 : (cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha);

      C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
      lambdaPrev = lambda;
      lambda = L + (1 - C) * f * sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

      if (Math.abs(lambda - lambdaPrev) < EPSILON) break;
    }

    // Pontos antipodais (falha de convergência) → fallback Haversine
    if (Math.abs(lambda) > Math.PI) {
      return VincentyStrategy.#haversineFallback(from, to);
    }

    const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
    const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const deltaSigma = B * sinSigma * (cos2SigmaM +
      (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

    return b * A * (sigma - deltaSigma);
  }

  /**
   * Fallback Haversine para pontos antipodais onde Vincenty não converge.
   * @param {{ lat: number, lng: number }} from
   * @param {{ lat: number, lng: number }} to
   * @returns {number}
   */
  static #haversineFallback(from, to) {
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat  = toRad(to.lat - from.lat);
    const dLng  = toRad(to.lng - from.lng);
    const s = Math.sin(dLat / 2);
    const c = Math.sin(dLng / 2);
    const chord = s * s + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * c * c;
    return 2 * R * Math.asin(Math.sqrt(chord));
  }
}

module.exports = { VincentyStrategy };
