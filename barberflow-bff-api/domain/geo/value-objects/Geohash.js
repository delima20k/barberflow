'use strict';

const { BaseValueObject } = require('../../shared/BaseValueObject');
const { Result }      = require('../../shared/Result');

// =============================================================
// Geohash — Value Object imutável para hashes espaciais (RFC geohash).
//
// Alphabeto base32: "0123456789bcdefghjkmnpqrstuvwxyz"
// (a, i, l, o são excluídos do padrão geohash).
// Precisão válida: 1–12 caracteres.
//
// encode()   → Geohash a partir de lat/lng
// fromString → Geohash a partir de string pré-codificada
// decode()   → { lat, lng } (centróide da célula)
// neighbors()→ { n, ne, e, se, s, sw, w, nw } strings de hash vizinho
// =============================================================

// ── Constantes internas ────────────────────────────────────────

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const BASE32_RE = /^[0-9bcdefghjkmnpqrstuvwxyz]+$/;

class Geohash extends BaseValueObject {
  /** @param {{ value: string }} props */
  constructor(props) {
    super(props);
  }

  // ── Factories ──────────────────────────────────────────────────

  /**
   * Codifica lat/lng em Geohash de `precision` caracteres.
   * @param {{ lat: number, lng: number, precision?: number }} param0
   * @returns {Result<Geohash, string>}
   */
  static encode({ lat, lng, precision = 7 } = {}) {
    if (typeof precision !== 'number' || precision < 1 || precision > 12)
      return Result.fail('Geohash.encode: precision deve ser inteiro entre 1 e 12');

    if (typeof lat !== 'number' || !isFinite(lat) || lat < -90 || lat > 90)
      return Result.fail('Geohash.encode: lat inválida');

    if (typeof lng !== 'number' || !isFinite(lng) || lng < -180 || lng > 180)
      return Result.fail('Geohash.encode: lng inválida');

    const hash = Geohash.#encodeRaw(lat, lng, precision);
    return Result.ok(new Geohash({ value: hash }));
  }

  /**
   * Cria um Geohash a partir de string pré-codificada.
   * @param {string} hash
   * @returns {Result<Geohash, string>}
   */
  static fromString(hash) {
    if (typeof hash !== 'string' || hash.length === 0)
      return Result.fail('Geohash.fromString: hash deve ser string não vazia');

    if (hash.length > 12)
      return Result.fail('Geohash.fromString: hash não pode ter mais de 12 caracteres');

    if (!BASE32_RE.test(hash))
      return Result.fail(`Geohash.fromString: hash contém caracteres inválidos: "${hash}"`);

    return Result.ok(new Geohash({ value: hash }));
  }

  // ── Contrato BaseValueObject ───────────────────────────────────

  /** @returns {Result<Geohash, string>} */
  _validate() {
    const { value } = this._props;

    if (typeof value !== 'string' || value.length === 0)
      return Result.fail('Geohash: valor deve ser string não vazia');

    if (value.length > 12)
      return Result.fail('Geohash: comprimento máximo é 12');

    if (!BASE32_RE.test(value))
      return Result.fail(`Geohash: caracteres inválidos em "${value}"`);

    return Result.ok(this);
  }

  // ── Getters ────────────────────────────────────────────────────

  /** @returns {string} */
  get value() { return this._props.value; }

  /** @returns {number} Comprimento = precisão */
  get precision() { return this._props.value.length; }

  // ── Decode ─────────────────────────────────────────────────────

  /**
   * Decodifica o hash para o centróide da célula.
   * @returns {{ lat: number, lng: number }}
   */
  decode() {
    return Geohash.#decodeRaw(this._props.value);
  }

  // ── Neighbors ─────────────────────────────────────────────────

  /**
   * Retorna os 8 vizinhos como strings de hash.
   * @returns {{ n: string, ne: string, e: string, se: string, s: string, sw: string, w: string, nw: string }}
   */
  neighbors() {
    const h = this._props.value;
    const n  = Geohash.#neighbor(h, 'n');
    const s  = Geohash.#neighbor(h, 's');
    const e  = Geohash.#neighbor(h, 'e');
    const w  = Geohash.#neighbor(h, 'w');
    return {
      n,
      ne: Geohash.#neighbor(e, 'n'),
      e,
      se: Geohash.#neighbor(e, 's'),
      s,
      sw: Geohash.#neighbor(w, 's'),
      w,
      nw: Geohash.#neighbor(w, 'n'),
    };
  }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {{ value: string, precision: number }} */
  toJSON() {
    return { value: this._props.value, precision: this._props.value.length };
  }

  // ── Algoritmo puro (privados estáticos) ────────────────────────

  /**
   * Codificação geohash base32 pura.
   * Alterna entre longitude e latitude, construindo bits em big-endian.
   * @param {number} lat
   * @param {number} lng
   * @param {number} precision
   * @returns {string}
   */
  static #encodeRaw(lat, lng, precision) {
    let idx = 0;       // índice na tabela BASE32
    let bit = 0;       // bit atual dentro do char (0..4)
    let isEven = true; // true = codifica lng, false = codifica lat
    let minLat = -90, maxLat = 90;
    let minLng = -180, maxLng = 180;
    let hash = '';

    while (hash.length < precision) {
      if (isEven) {
        const mid = (minLng + maxLng) / 2;
        if (lng >= mid) { idx = (idx << 1) | 1; minLng = mid; }
        else            { idx = (idx << 1);      maxLng = mid; }
      } else {
        const mid = (minLat + maxLat) / 2;
        if (lat >= mid) { idx = (idx << 1) | 1; minLat = mid; }
        else            { idx = (idx << 1);      maxLat = mid; }
      }
      isEven = !isEven;

      if (++bit === 5) {
        hash += BASE32[idx];
        bit = 0;
        idx = 0;
      }
    }
    return hash;
  }

  /**
   * Decodificação geohash base32 pura.
   * @param {string} hash
   * @returns {{ lat: number, lng: number }}
   */
  static #decodeRaw(hash) {
    let isEven = true;
    let minLat = -90, maxLat = 90;
    let minLng = -180, maxLng = 180;

    for (let i = 0; i < hash.length; i++) {
      const c = BASE32.indexOf(hash[i]);
      for (let bits = 4; bits >= 0; bits--) {
        const bit = (c >> bits) & 1;
        if (isEven) {
          const mid = (minLng + maxLng) / 2;
          if (bit) minLng = mid; else maxLng = mid;
        } else {
          const mid = (minLat + maxLat) / 2;
          if (bit) minLat = mid; else maxLat = mid;
        }
        isEven = !isEven;
      }
    }
    return {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    };
  }

  /**
   * Calcula o hash vizinho em uma direção (n/s/e/w).
   * Algoritmo: decode → deslocar centro da célula → encode.
   * Garante resultado correto em todos os casos (polos, antimeridiano).
   * @param {string} hash
   * @param {'n'|'s'|'e'|'w'} dir
   * @returns {string}
   */
  static #neighbor(hash, dir) {
    const box = Geohash.#decodeBox(hash);
    const centerLat = (box.minLat + box.maxLat) / 2;
    const centerLng = (box.minLng + box.maxLng) / 2;
    const latSpan   = box.maxLat - box.minLat;
    const lngSpan   = box.maxLng - box.minLng;

    let nlat = centerLat;
    let nlng = centerLng;

    switch (dir) {
      case 'n': nlat = centerLat + latSpan; break;
      case 's': nlat = centerLat - latSpan; break;
      case 'e': nlng = centerLng + lngSpan; break;
      case 'w': nlng = centerLng - lngSpan; break;
    }

    // Clamp latitude aos limites do globo
    nlat = Math.max(-90, Math.min(90, nlat));

    // Wrap longitude pelo antimeridiano
    if (nlng > 180)  nlng -= 360;
    if (nlng < -180) nlng += 360;

    return Geohash.#encodeRaw(nlat, nlng, hash.length);
  }

  /**
   * Decodifica o hash para a bounding box (min/max lat/lng).
   * Usado pelo #neighbor para calcular deslocamento.
   * @param {string} hash
   * @returns {{ minLat: number, maxLat: number, minLng: number, maxLng: number }}
   */
  static #decodeBox(hash) {
    let isEven = true;
    let minLat = -90, maxLat = 90;
    let minLng = -180, maxLng = 180;

    for (let i = 0; i < hash.length; i++) {
      const c = BASE32.indexOf(hash[i]);
      for (let bits = 4; bits >= 0; bits--) {
        const bit = (c >> bits) & 1;
        if (isEven) {
          const mid = (minLng + maxLng) / 2;
          if (bit) minLng = mid; else maxLng = mid;
        } else {
          const mid = (minLat + maxLat) / 2;
          if (bit) minLat = mid; else maxLat = mid;
        }
        isEven = !isEven;
      }
    }
    return { minLat, maxLat, minLng, maxLng };
  }
}

module.exports = { Geohash };
