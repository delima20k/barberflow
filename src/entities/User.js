'use strict';

// =============================================================
// User.js — Entidade de domínio do usuário autenticado.
// Camada: domain
//
// Representa a linha de auth.users (Supabase Auth) enriquecida
// com o campo `role` vindo da tabela profiles.
//
// REGRAS DE SEGURANÇA:
//   - #passwordHash armazena APENAS hash bcrypt, nunca texto puro.
//   - toJSON() NUNCA serializa o hash — segredo permanece no servidor.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class User {

  static #ROLES_VALIDOS = ['client', 'barber', 'owner', 'manager', 'admin'];

  #id;
  #email;
  #passwordHash;      // bcrypt hash — nunca texto puro
  #role;
  #isActive;
  #emailVerifiedAt;
  #createdAt;

  /** @param {object} row — linha de auth.users (+ role de profiles) */
  constructor(row) {
    this.#id              = row?.id                ?? null;
    this.#email           = row?.email             ?? '';
    this.#passwordHash    = row?.password_hash     ?? null;
    this.#role            = row?.role              ?? 'client';
    this.#isActive        = row?.is_active         ?? true;
    this.#emailVerifiedAt = row?.email_verified_at ?? null;
    this.#createdAt       = row?.created_at        ?? null;
  }

  /** @param {object} row @returns {User} */
  static fromRow(row) {
    return new User(row ?? {});
  }

  /** @returns {string[]} */
  static get rolesValidos() {
    return [...User.#ROLES_VALIDOS];
  }

  // ── Getters ───────────────────────────────────────────────
  get id()              { return this.#id; }
  get email()           { return this.#email; }
  get passwordHash()    { return this.#passwordHash; }
  get role()            { return this.#role; }
  get isActive()        { return this.#isActive; }
  get emailVerifiedAt() { return this.#emailVerifiedAt; }
  get createdAt()       { return this.#createdAt; }

  // ── Validação ─────────────────────────────────────────────

  /** @returns {{ ok: boolean, erros: string[] }} */
  validar() {
    const erros = [];

    const rEmail = InputValidator.email(this.#email);
    if (!rEmail.ok) erros.push(rEmail.msg);

    if (!this.#role) {
      erros.push('Role é obrigatório.');
    } else if (!User.#ROLES_VALIDOS.includes(this.#role)) {
      erros.push(`Role inválido: "${this.#role}". Permitidos: ${User.#ROLES_VALIDOS.join(', ')}.`);
    }

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de domínio ────────────────────────────────────

  /** @returns {boolean} */
  isAtivo() { return this.#isActive === true; }

  /** @returns {boolean} e-mail confirmado pelo usuário */
  isEmailVerificado() {
    return this.#emailVerifiedAt !== null && this.#emailVerifiedAt !== undefined;
  }

  /**
   * Verifica se o usuário possui o role informado.
   * @param {string} role
   * @returns {boolean}
   */
  hasRole(role) { return this.#role === role; }

  /** @returns {boolean} */
  isAdmin() { return this.#role === 'admin'; }

  // ── Serialização ─────────────────────────────────────────

  /**
   * Retorna representação JSON segura — passwordHash é OMITIDO.
   * @returns {object}
   */
  toJSON() {
    return {
      id:                this.#id,
      email:             this.#email,
      role:              this.#role,
      is_active:         this.#isActive,
      email_verified_at: this.#emailVerifiedAt,
      created_at:        this.#createdAt,
      // password_hash: <intencionalmente omitido>
    };
  }
}

module.exports = User;
