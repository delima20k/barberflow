'use strict';

// =============================================================
// Servico.js — Entidade de domínio de serviço oferecido por barbearia.
// Camada: domain
//
// Sem dependências de framework ou banco de dados.
// Adaptado de shared/js/Servico.js para uso em Node.js.
// =============================================================

class Servico {

  #id;
  #barbershopId;
  #name;
  #price;
  #durationMin;
  #isActive;

  constructor({ id, barbershop_id, name, price, duration_min, is_active } = {}) {
    this.#id           = id            ?? null;
    this.#barbershopId = barbershop_id ?? null;
    this.#name         = name          ?? '';
    this.#price        = price         ?? null;
    this.#durationMin  = duration_min  ?? null;
    this.#isActive     = is_active     ?? true;
  }

  /** @param {object} row @returns {Servico} */
  static fromRow(row) {
    return new Servico(row ?? {});
  }

  // ── Getters ───────────────────────────────────────────────
  get id()           { return this.#id; }
  get barbershopId() { return this.#barbershopId; }
  get name()         { return this.#name; }
  get price()        { return this.#price; }
  get durationMin()  { return this.#durationMin; }
  get isActive()     { return this.#isActive; }

  // ── Validação ─────────────────────────────────────────────

  /** @returns {{ ok: boolean, erros: string[] }} */
  validar() {
    const erros = [];

    if (!this.#barbershopId)
      erros.push('ID da barbearia é obrigatório.');

    if (!this.#name?.trim())
      erros.push('Nome do serviço é obrigatório.');

    if (this.#price !== null) {
      if (typeof this.#price !== 'number' || !isFinite(this.#price) || this.#price < 0)
        erros.push('Preço inválido.');
    }

    if (this.#durationMin !== null) {
      if (!Number.isInteger(this.#durationMin) || this.#durationMin < 1 || this.#durationMin > 480)
        erros.push('Duração deve ser inteiro entre 1 e 480 minutos.');
    }

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de domínio ────────────────────────────────────

  /** @returns {boolean} */
  isAtivo() { return this.#isActive === true; }

  /** @returns {boolean} */
  temPreco() { return this.#price !== null && this.#price > 0; }

  /** @returns {object} */
  toJSON() {
    return {
      id:            this.#id,
      barbershop_id: this.#barbershopId,
      name:          this.#name,
      price:         this.#price,
      duration_min:  this.#durationMin,
      is_active:     this.#isActive,
    };
  }
}

module.exports = Servico;
