'use strict';

const { BaseValueObject } = require('../../shared/BaseValueObject');
const { Result }      = require('../../shared/Result');

// =============================================================
// Coordinate — Value Object imutável para coordenadas WGS-84.
//
// Limites: lat ∈ [-90, 90], lng ∈ [-180, 180].
// Ambos precisam ser números finitos (nem NaN, nem ±Infinity).
// =============================================================

class Coordinate extends BaseValueObject {
  /** @param {{ lat: number, lng: number }} props */
  constructor(props) {
    super(props);
  }

  // ── Factory ────────────────────────────────────────────────────

  /**
   * Cria um Coordinate com validação.
   * @param {{ lat: number, lng: number }} props
   * @returns {Result<Coordinate, string>}
   */
  static create(props) {
    const vo = new Coordinate(props ?? {});
    return vo._validate();
  }

  // ── Contrato BaseValueObject ───────────────────────────────────

  /** @returns {Result<Coordinate, string>} */
  _validate() {
    const { lat, lng } = this._props;

    if (typeof lat !== 'number' || !isFinite(lat))
      return Result.fail('Coordinate: lat deve ser um número finito');

    if (typeof lng !== 'number' || !isFinite(lng))
      return Result.fail('Coordinate: lng deve ser um número finito');

    if (lat < -90 || lat > 90)
      return Result.fail(`Coordinate: lat ${lat} fora do intervalo [-90, 90]`);

    if (lng < -180 || lng > 180)
      return Result.fail(`Coordinate: lng ${lng} fora do intervalo [-180, 180]`);

    return Result.ok(this);
  }

  // ── Getters ────────────────────────────────────────────────────

  /** @returns {number} */
  get lat() { return this._props.lat; }

  /** @returns {number} */
  get lng() { return this._props.lng; }

  // ── Transformações ─────────────────────────────────────────────

  /**
   * Retorna par [lat, lng] para uso em bibliotecas compatíveis (Leaflet, L.LatLng, etc.).
   * @returns {[number, number]}
   */
  toLatLng() {
    return [this._props.lat, this._props.lng];
  }

  /**
   * Retorna { x: lng, y: lat } — convenção PostGIS (x=longitude, y=latitude).
   * @returns {{ x: number, y: number }}
   */
  toPostGIS() {
    return { x: this._props.lng, y: this._props.lat };
  }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {{ lat: number, lng: number }} */
  toJSON() {
    return { lat: this._props.lat, lng: this._props.lng };
  }
}

module.exports = { Coordinate };
