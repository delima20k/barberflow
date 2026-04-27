'use strict';

// =============================================================
// Barbearia.js — Entidade de domínio de barbearia.
// Camada: domain
//
// Sem dependências de framework ou banco de dados.
// Adaptado de shared/js/Barbearia.js para uso em Node.js.
// =============================================================

class Barbearia {

  #id;
  #name;
  #ownerId;
  #address;
  #city;
  #lat;
  #lng;
  #phone;
  #isActive;

  constructor({ id, name, owner_id, address, city, lat, lng, phone, is_active } = {}) {
    this.#id       = id        ?? null;
    this.#name     = name      ?? '';
    this.#ownerId  = owner_id  ?? null;
    this.#address  = address   ?? '';
    this.#city     = city      ?? '';
    this.#lat      = typeof lat === 'number' ? lat : null;
    this.#lng      = typeof lng === 'number' ? lng : null;
    this.#phone    = phone     ?? '';
    this.#isActive = is_active ?? true;
  }

  /** @param {object} row @returns {Barbearia} */
  static fromRow(row) {
    return new Barbearia(row ?? {});
  }

  // ── Getters ───────────────────────────────────────────────
  get id()       { return this.#id; }
  get name()     { return this.#name; }
  get ownerId()  { return this.#ownerId; }
  get address()  { return this.#address; }
  get city()     { return this.#city; }
  get lat()      { return this.#lat; }
  get lng()      { return this.#lng; }
  get phone()    { return this.#phone; }
  get isActive() { return this.#isActive; }

  // ── Validação ─────────────────────────────────────────────

  /** @returns {{ ok: boolean, erros: string[] }} */
  validar() {
    const erros = [];

    if (!this.#name?.trim())
      erros.push('Nome da barbearia é obrigatório.');

    if (!this.#ownerId)
      erros.push('ID do proprietário é obrigatório.');

    if (!this.#city?.trim())
      erros.push('Cidade é obrigatória.');

    if (this.#lat !== null && this.#lng === null)
      erros.push('Longitude é obrigatória quando latitude é informada.');
    if (this.#lng !== null && this.#lat === null)
      erros.push('Latitude é obrigatória quando longitude é informada.');
    if (this.#lat !== null && (typeof this.#lat !== 'number' || !isFinite(this.#lat)))
      erros.push('Latitude inválida.');
    if (this.#lng !== null && (typeof this.#lng !== 'number' || !isFinite(this.#lng)))
      erros.push('Longitude inválida.');

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de domínio ────────────────────────────────────

  /** @returns {boolean} */
  isAtiva() { return this.#isActive === true; }

  /** @returns {boolean} */
  possuiLocalizacao() {
    return this.#lat !== null && this.#lng !== null;
  }

  /** @returns {object} */
  toJSON() {
    return {
      id:        this.#id,
      name:      this.#name,
      owner_id:  this.#ownerId,
      address:   this.#address,
      city:      this.#city,
      lat:       this.#lat,
      lng:       this.#lng,
      phone:     this.#phone,
      is_active: this.#isActive,
    };
  }
}

module.exports = Barbearia;
