'use strict';

const { BaseEntity } = require('../../shared/BaseEntity');
const { Coordinate } = require('../value-objects/Coordinate');

// =============================================================
// GeoFence — Entidade circular definida por center + radiusMeters.
//
// Responsabilidades:
//   - Persistir configuração de geofence por dono (ownerId)
//   - Testar se uma coordenada está dentro do raio (contains)
//   - Ativar/desativar
//
// Teste de contenção usa Haversine inline (sem IO, puro math).
// =============================================================

const EARTH_RADIUS_M = 6371000;

class GeoFence extends BaseEntity {
  /** @type {string}     */ #name;
  /** @type {string}     */ #ownerId;
  /** @type {Coordinate} */ #center;
  /** @type {number}     */ #radiusMeters;
  /** @type {boolean}    */ #isActive;

  /**
   * @param {object} params
   * @param {string}          params.id
   * @param {string}          params.name
   * @param {string}          params.ownerId
   * @param {Coordinate}      params.center
   * @param {number}          params.radiusMeters
   * @param {boolean}         [params.isActive]
   * @param {Date|string}     [params.createdAt]
   * @param {Date|string}     [params.updatedAt]
   */
  constructor({ id, name, ownerId, center, radiusMeters, isActive = true, createdAt, updatedAt }) {
    super(id, createdAt, updatedAt);

    if (!name || typeof name !== 'string')
      throw new TypeError('GeoFence: name deve ser string não vazia');

    if (!ownerId || typeof ownerId !== 'string')
      throw new TypeError('GeoFence: ownerId deve ser string não vazia');

    if (!(center instanceof Coordinate))
      throw new TypeError('GeoFence: center deve ser instância de Coordinate');

    if (typeof radiusMeters !== 'number' || radiusMeters <= 0 || !isFinite(radiusMeters))
      throw new TypeError('GeoFence: radiusMeters deve ser número > 0');

    this.#name         = name;
    this.#ownerId      = ownerId;
    this.#center       = center;
    this.#radiusMeters = radiusMeters;
    this.#isActive     = Boolean(isActive);
  }

  // ── Comportamento principal ────────────────────────────────────

  /**
   * Verifica se a coordenada dada está dentro do raio da geofence.
   * Usa fórmula Haversine (sem IO).
   *
   * @param {Coordinate} coordinate
   * @returns {boolean}
   */
  contains(coordinate) {
    if (!(coordinate instanceof Coordinate))
      throw new TypeError('GeoFence.contains: coordinate deve ser instância de Coordinate');

    const distM = GeoFence.#haversineMeters(this.#center, coordinate);
    return distM <= this.#radiusMeters;
  }

  /**
   * Ativa a geofence.
   */
  activate() {
    this.#isActive = true;
    this._touch();
  }

  /**
   * Desativa a geofence.
   */
  deactivate() {
    this.#isActive = false;
    this._touch();
  }

  // ── Getters ────────────────────────────────────────────────────

  /** @returns {string} */
  get name() { return this.#name; }

  /** @returns {string} */
  get ownerId() { return this.#ownerId; }

  /** @returns {Coordinate} */
  get center() { return this.#center; }

  /** @returns {number} Raio em metros */
  get radiusMeters() { return this.#radiusMeters; }

  /** @returns {boolean} */
  get isActive() { return this.#isActive; }

  // ── Internos ───────────────────────────────────────────────────

  /**
   * Fórmula Haversine inline para evitar dependência de infrastructure.
   * @param {Coordinate} a
   * @param {Coordinate} b
   * @returns {number} Distância em metros
   */
  static #haversineMeters(a, b) {
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat  = toRad(b.lat - a.lat);
    const dLng  = toRad(b.lng - a.lng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const chord  = sinLat * sinLat +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(chord));
  }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {object} */
  toJSON() {
    return {
      ...super.toJSON(),
      name:         this.#name,
      ownerId:      this.#ownerId,
      center:       this.#center.toJSON(),
      radiusMeters: this.#radiusMeters,
      isActive:     this.#isActive,
    };
  }
}

module.exports = { GeoFence };
