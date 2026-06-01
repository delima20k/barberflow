'use strict';

const { BaseEntity } = require('../../shared/BaseEntity');
const { Coordinate } = require('../value-objects/Coordinate');

// =============================================================
// Track — Janela deslizante de posições de um usuário.
//
// Responsabilidades:
//   1. Manter as últimas N leituras de posição (sliding window)
//   2. Detectar spoofing via velocidade anômala (Haversine puro)
//   3. Expor se a última atualização foi flagged como spoof
//
// Anti-spoof: speed = distance / time_elapsed
// Se speed > maxSpeedKmh → flaggedSpoof = true
// (exemplo: 1000 km/h cobre casos legítimos de avião mas barra teleportes)
//
// Algoritmo Haversine inline — sem dependência de infrastructure.
// =============================================================

const EARTH_RADIUS_M = 6371000;

/** @typedef {{ coordinate: Coordinate, timestamp: Date }} PositionSnapshot */

class Track extends BaseEntity {
  /** @type {PositionSnapshot[]} */
  #positions;

  /** @type {number} Tamanho máximo da janela deslizante */
  #windowSize;

  /** @type {number} Velocidade máxima plausível (km/h) */
  #maxSpeedKmh;

  /** @type {boolean} Última leitura foi flagged como spoof */
  #flaggedSpoof;

  /**
   * @param {object} params
   * @param {string}               params.userId       - ID do usuário (= entidade id)
   * @param {PositionSnapshot[]}   [params.positions]  - Posições iniciais (opcionais)
   * @param {number}               [params.windowSize]
   * @param {number}               [params.maxSpeedKmh]
   */
  constructor({ userId, positions = [], windowSize = 3, maxSpeedKmh = 1000 }) {
    super(userId);

    if (typeof windowSize !== 'number' || windowSize < 1)
      throw new TypeError('Track: windowSize deve ser inteiro >= 1');

    if (typeof maxSpeedKmh !== 'number' || maxSpeedKmh <= 0)
      throw new TypeError('Track: maxSpeedKmh deve ser número > 0');

    this.#windowSize  = windowSize;
    this.#maxSpeedKmh = maxSpeedKmh;
    this.#flaggedSpoof = false;
    this.#positions   = [];

    // Carrega posições iniciais sem recalcular spoof (estado vindo de persistência)
    for (const snap of positions) {
      this.#pushSnapshot(snap);
    }
  }

  // ── Comportamento principal ────────────────────────────────────

  /**
   * Adiciona uma nova leitura de posição.
   * Detecta spoof por velocidade. Mantém apenas os últimos #windowSize itens.
   *
   * @param {Coordinate} coordinate
   * @param {Date}       [timestamp]
   * @returns {{ isFlagged: boolean }} Se a leitura foi flagged como spoof
   */
  addPosition(coordinate, timestamp = new Date()) {
    if (!(coordinate instanceof Coordinate))
      throw new TypeError('Track.addPosition: coordinate deve ser instância de Coordinate');

    if (!(timestamp instanceof Date) || isNaN(timestamp.getTime()))
      throw new TypeError('Track.addPosition: timestamp deve ser Date válido');

    const isFlagged = this.#checkSpoof(coordinate, timestamp);
    this.#flaggedSpoof = isFlagged;
    this.#pushSnapshot({ coordinate, timestamp });
    this._touch();

    return { isFlagged };
  }

  // ── Getters ────────────────────────────────────────────────────

  /** @returns {boolean} */
  get flaggedSpoof() { return this.#flaggedSpoof; }

  /** @returns {Coordinate|null} Posição mais recente ou null se vazio */
  get currentPosition() {
    if (this.#positions.length === 0) return null;
    return this.#positions[this.#positions.length - 1].coordinate;
  }

  /** @returns {PositionSnapshot[]} Cópia da janela atual (mais recente no final) */
  get snapshots() { return [...this.#positions]; }

  /** @returns {string} ID do usuário dono do track */
  get userId() { return this.id; }

  // ── Internos ───────────────────────────────────────────────────

  /**
   * Verifica se a nova posição implica velocidade acima de maxSpeedKmh.
   * @param {Coordinate} newCoord
   * @param {Date}       newTs
   * @returns {boolean}
   */
  #checkSpoof(newCoord, newTs) {
    if (this.#positions.length === 0) return false;

    const prev   = this.#positions[this.#positions.length - 1];
    const distM  = Track.#haversineMeters(prev.coordinate, newCoord);
    const deltaS = (newTs.getTime() - prev.timestamp.getTime()) / 1000;

    if (deltaS <= 0) return false; // Timestamps iguais ou invertidos — não flagear

    const speedKmh = (distM / deltaS) * 3.6;
    return speedKmh > this.#maxSpeedKmh;
  }

  /**
   * Insere snapshot respeitando o limite da janela deslizante.
   * @param {PositionSnapshot} snap
   */
  #pushSnapshot(snap) {
    this.#positions.push(snap);
    if (this.#positions.length > this.#windowSize) {
      this.#positions.shift();
    }
  }

  /**
   * Distância em metros entre dois Coordinates (fórmula Haversine).
   * @param {Coordinate} a
   * @param {Coordinate} b
   * @returns {number}
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
      userId:       this.id,
      flaggedSpoof: this.#flaggedSpoof,
      windowSize:   this.#windowSize,
      positions:    this.#positions.map(s => ({
        coordinate: s.coordinate.toJSON(),
        timestamp:  s.timestamp.toISOString(),
      })),
    };
  }
}

module.exports = { Track };
