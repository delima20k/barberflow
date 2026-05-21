'use strict';

const { BaseValueObject } = require('../../shared/BaseValueObject');
const { Result }      = require('../../shared/Result');

// =============================================================
// Distance — Value Object imutável para distâncias em metros.
//
// Invariante: meters >= 0, finito e numérico.
// Fábrica auxiliar `ofKm()` recebe quilômetros e converte.
// =============================================================

class Distance extends BaseValueObject {
  /** @param {{ meters: number }} props */
  constructor(props) {
    super(props);
  }

  // ── Factories ──────────────────────────────────────────────────

  /**
   * Cria um Distance a partir de metros.
   * @param {{ meters: number }} props
   * @returns {Result<Distance, string>}
   */
  static create(props) {
    const vo = new Distance(props ?? {});
    return vo._validate();
  }

  /**
   * Cria um Distance a partir de quilômetros.
   * @param {number} km
   * @returns {Result<Distance, string>}
   */
  static ofKm(km) {
    if (typeof km !== 'number') return Result.fail('Distance.ofKm: km deve ser número');
    return Distance.create({ meters: km * 1000 });
  }

  // ── Contrato BaseValueObject ───────────────────────────────────

  /** @returns {Result<Distance, string>} */
  _validate() {
    const { meters } = this._props;

    if (typeof meters !== 'number' || !isFinite(meters))
      return Result.fail('Distance: meters deve ser um número finito');

    if (meters < 0)
      return Result.fail(`Distance: meters ${meters} não pode ser negativo`);

    return Result.ok(this);
  }

  // ── Getters ────────────────────────────────────────────────────

  /** @returns {number} Distância em metros */
  get meters() { return this._props.meters; }

  /** @returns {number} Distância em quilômetros */
  get km() { return this._props.meters / 1000; }

  // ── Comparações ────────────────────────────────────────────────

  /**
   * @param {Distance} other
   * @returns {boolean}
   */
  isGreaterThan(other) {
    return this._props.meters > other.meters;
  }

  /**
   * @param {Distance} other
   * @returns {boolean}
   */
  isLessThan(other) {
    return this._props.meters < other.meters;
  }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {{ meters: number, km: number }} */
  toJSON() {
    return { meters: this._props.meters, km: this.km };
  }
}

module.exports = { Distance };
