'use strict';

const { Coordinate } = require('../value-objects/Coordinate');
const { Distance }   = require('../value-objects/Distance');
const { Result }     = require('../../shared/Result');

// =============================================================
// DistanceCalculator — Domain Service para cálculo de distância.
//
// Responsabilidade única: delegar o cálculo de distância a
// uma IDistanceStrategy injetada. Retorna Distance VO.
//
// Stateless: cada cálculo é independente.
// =============================================================

class DistanceCalculator {
  /** @type {import('../ports/IDistanceStrategy').IDistanceStrategy} */
  #strategy;

  /**
   * @param {object} params
   * @param {import('../ports/IDistanceStrategy').IDistanceStrategy} params.strategy
   */
  constructor({ strategy }) {
    if (!strategy || typeof strategy.calculateMeters !== 'function')
      throw new TypeError('DistanceCalculator: strategy deve implementar IDistanceStrategy');

    this.#strategy = strategy;
  }

  // ── Interface pública ──────────────────────────────────────────

  /**
   * Calcula distância entre dois Coordinates.
   * @param {Coordinate} from
   * @param {Coordinate} to
   * @returns {Result<Distance, string>}
   */
  calculate(from, to) {
    if (!(from instanceof Coordinate))
      return Result.fail('DistanceCalculator.calculate: "from" deve ser instância de Coordinate');

    if (!(to instanceof Coordinate))
      return Result.fail('DistanceCalculator.calculate: "to" deve ser instância de Coordinate');

    try {
      const meters = this.#strategy.calculateMeters(from.toJSON(), to.toJSON());
      return Distance.create({ meters });
    } catch (err) {
      return Result.fail(`DistanceCalculator: erro na strategy — ${err.message}`);
    }
  }

  /**
   * Nome da strategy ativa (para logging/diagnóstico).
   * @returns {string}
   */
  get strategyName() {
    return this.#strategy.name;
  }
}

module.exports = { DistanceCalculator };
