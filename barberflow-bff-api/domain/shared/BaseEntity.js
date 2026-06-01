'use strict';

/**
 * BaseEntity — Entidade de domínio identificada por um ID único.
 *
 * Regras:
 *  - Igualdade por IDENTIDADE (id), nunca por referência ou estado.
 *  - ID é imutável após criação.
 *  - Subclasses adicionam comportamentos de negócio e invariantes.
 *  - Eventos de domínio ficam em BaseAggregateRoot (não aqui).
 */
class BaseEntity {
  /** @type {string}  */ #id;
  /** @type {Date}    */ #createdAt;
  /** @type {Date}    */ #updatedAt;

  /**
   * @param {string}     id
   * @param {Date|string} [createdAt]
   * @param {Date|string} [updatedAt]
   */
  constructor(id, createdAt, updatedAt) {
    if (!id || typeof id !== 'string') {
      throw new TypeError(`${this.constructor.name}: id deve ser uma string não-vazia`);
    }

    const now        = new Date();
    this.#id         = id;
    this.#createdAt  = createdAt  ? new Date(createdAt)  : now;
    this.#updatedAt  = updatedAt  ? new Date(updatedAt)  : now;
  }

  // ── Propriedades ───────────────────────────────────────────────

  /** @returns {string} */
  get id()        { return this.#id; }

  /** @returns {Date} */
  get createdAt() { return new Date(this.#createdAt); }

  /** @returns {Date} */
  get updatedAt() { return new Date(this.#updatedAt); }

  // ── Mutação protegida ──────────────────────────────────────────

  /**
   * Atualiza updatedAt para o momento atual.
   * @protected
   */
  _touch() {
    this.#updatedAt = new Date();
  }

  // ── Igualdade ──────────────────────────────────────────────────

  /**
   * Igualdade por identidade.
   * @param {BaseEntity|null|undefined} other
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof BaseEntity)) return false;
    return this.#id === other.#id;
  }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {{ id: string, createdAt: string, updatedAt: string }} */
  toJSON() {
    return {
      id:        this.#id,
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString(),
    };
  }

  /** @returns {string} */
  toString() {
    return `${this.constructor.name}(${this.#id})`;
  }
}

module.exports = { BaseEntity };
