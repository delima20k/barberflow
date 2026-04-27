'use strict';

// =============================================================
// Profissional.js — Entidade de domínio de profissional.
// Camada: domain
//
// Sem dependências de framework ou banco de dados.
// Adaptado de shared/js/Profissional.js para uso em Node.js.
// =============================================================

class Profissional {

  static #ROLES_VALIDOS = ['barber', 'owner', 'manager'];

  #id;
  #userId;
  #barbershopId;
  #fullName;
  #role;
  #isActive;

  constructor({ id, user_id, barbershop_id, full_name, role, is_active } = {}) {
    this.#id           = id            ?? null;
    this.#userId       = user_id       ?? null;
    this.#barbershopId = barbershop_id ?? null;
    this.#fullName     = full_name     ?? '';
    this.#role         = role          ?? '';
    this.#isActive     = is_active     ?? true;
  }

  /** @param {object} row @returns {Profissional} */
  static fromRow(row) {
    return new Profissional(row ?? {});
  }

  // ── Getters ───────────────────────────────────────────────
  get id()           { return this.#id; }
  get userId()       { return this.#userId; }
  get barbershopId() { return this.#barbershopId; }
  get fullName()     { return this.#fullName; }
  get role()         { return this.#role; }
  get isActive()     { return this.#isActive; }

  // ── Validação ─────────────────────────────────────────────

  /** @returns {{ ok: boolean, erros: string[] }} */
  validar() {
    const erros = [];

    if (!this.#userId)
      erros.push('ID de usuário é obrigatório.');

    if (!this.#fullName?.trim())
      erros.push('Nome completo é obrigatório.');

    if (!this.#role)
      erros.push('Role é obrigatório.');
    else if (!Profissional.#ROLES_VALIDOS.includes(this.#role))
      erros.push(`Role inválido: "${this.#role}". Permitidos: ${Profissional.#ROLES_VALIDOS.join(', ')}.`);

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de domínio ────────────────────────────────────

  /** @returns {boolean} */
  isAtivo() { return this.#isActive === true; }

  /** @returns {boolean} */
  isOwner() { return this.#role === 'owner'; }

  /** @returns {boolean} */
  isManager() { return this.#role === 'manager'; }

  /** @returns {boolean} */
  isBarber() { return this.#role === 'barber'; }

  /** @returns {object} */
  toJSON() {
    return {
      id:            this.#id,
      user_id:       this.#userId,
      barbershop_id: this.#barbershopId,
      full_name:     this.#fullName,
      role:          this.#role,
      is_active:     this.#isActive,
    };
  }
}

module.exports = Profissional;
