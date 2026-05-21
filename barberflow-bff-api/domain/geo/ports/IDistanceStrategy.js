'use strict';

// =============================================================
// IDistanceStrategy — Port para algoritmos de cálculo de distância.
//
// Implementações concretas:
//   - HaversineStrategy  (rápido, erro ~0.5% em distâncias longas)
//   - VincentyStrategy   (mais preciso, iterativo, elipsoide WGS-84)
// =============================================================

/**
 * @interface
 */
class IDistanceStrategy {
  /**
   * Calcula a distância em metros entre dois pontos WGS-84.
   *
   * @param {{ lat: number, lng: number }} from
   * @param {{ lat: number, lng: number }} to
   * @returns {number} Distância em metros
   */
  calculateMeters(from, to) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.calculateMeters() não implementado`);
  }

  /**
   * Nome do algoritmo para logging/diagnóstico.
   * @returns {string}
   */
  get name() {
    throw new Error(`${this.constructor.name}.name não implementado`);
  }
}

module.exports = { IDistanceStrategy };
