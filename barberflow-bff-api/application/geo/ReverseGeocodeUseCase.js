'use strict';

const { Coordinate } = require('../../domain/geo/value-objects/Coordinate');
const { Result }     = require('../../domain/shared/Result');

// =============================================================
// ReverseGeocodeUseCase
// Converte coordenadas em endereço legível via geocoder reverso.
// =============================================================

class ReverseGeocodeUseCase {
  /** @type {object} */ #reverseGeocoder;

  /**
   * @param {object} deps
   * @param {object} deps.reverseGeocoder
   */
  constructor({ reverseGeocoder }) {
    this.#reverseGeocoder = reverseGeocoder;
  }

  /**
   * @param {object} params
   * @param {number} params.lat
   * @param {number} params.lng
   * @returns {Promise<Result<string>>}
   */
  async execute({ lat, lng } = {}) {
    const coordResult = Coordinate.create({ lat, lng });
    if (coordResult.isFail()) return Result.fail(coordResult.getError());

    const coord = coordResult.getValue();
    return this.#reverseGeocoder.reverseGeocode(coord.lat, coord.lng);
  }
}

module.exports = { ReverseGeocodeUseCase };
