'use strict';

const { BaseEntity } = require('../../shared/BaseEntity');
const { Coordinate } = require('../value-objects/Coordinate');

// =============================================================
// Place — Entidade que representa um ponto de interesse com geo.
//
// Usado como resultado de queries de proximidade (barbearia, etc).
// Igualdade por ID.
// =============================================================

/** @readonly @enum {string} */
const PlaceType = Object.freeze({
  BARBERSHOP: 'barbershop',
  POI:        'poi',
});

class Place extends BaseEntity {
  /** @type {string}      */ #name;
  /** @type {PlaceType}   */ #type;
  /** @type {Coordinate}  */ #coordinate;
  /** @type {number|null} */ #distanceMeters;
  /** @type {object}      */ #metadata;

  /**
   * @param {object} params
   * @param {string}          params.id
   * @param {string}          params.name
   * @param {PlaceType}       params.type
   * @param {Coordinate}      params.coordinate
   * @param {number|null}     [params.distanceMeters]
   * @param {object}          [params.metadata]
   * @param {Date|string}     [params.createdAt]
   * @param {Date|string}     [params.updatedAt]
   */
  constructor({ id, name, type, coordinate, distanceMeters = null, metadata = {}, createdAt, updatedAt }) {
    super(id, createdAt, updatedAt);

    if (!name || typeof name !== 'string')
      throw new TypeError('Place: name deve ser string não vazia');

    if (!Object.values(PlaceType).includes(type))
      throw new TypeError(`Place: type inválido — "${type}"`);

    if (!(coordinate instanceof Coordinate))
      throw new TypeError('Place: coordinate deve ser instância de Coordinate');

    if (distanceMeters !== null && (typeof distanceMeters !== 'number' || distanceMeters < 0))
      throw new TypeError('Place: distanceMeters deve ser número >= 0 ou null');

    this.#name           = name;
    this.#type           = type;
    this.#coordinate     = coordinate;
    this.#distanceMeters = distanceMeters;
    this.#metadata       = Object.freeze({ ...metadata });
  }

  // ── Getters ────────────────────────────────────────────────────

  /** @returns {string} */
  get name() { return this.#name; }

  /** @returns {PlaceType} */
  get type() { return this.#type; }

  /** @returns {Coordinate} */
  get coordinate() { return this.#coordinate; }

  /** @returns {number|null} Distância em metros a partir do ponto de referência da query */
  get distanceMeters() { return this.#distanceMeters; }

  /** @returns {object} Metadados extras (ex: rating, foto, serviços) */
  get metadata() { return this.#metadata; }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {object} */
  toJSON() {
    return {
      ...super.toJSON(),
      name:            this.#name,
      type:            this.#type,
      coordinate:      this.#coordinate.toJSON(),
      distanceMeters:  this.#distanceMeters,
      metadata:        this.#metadata,
    };
  }
}

module.exports = { Place, PlaceType };
