'use strict';

const { BaseEntity }  = require('./BaseEntity');
const { DomainEvent } = require('./DomainEvent');

/**
 * BaseAggregateRoot — Raiz de agregado que acumula e publica eventos de domínio.
 *
 * Regras:
 *  - Apenas a raiz do agregado pode ser referenciada externamente.
 *  - Eventos são levantados via `_raise(event)` — nunca disparados diretamente.
 *  - `pullDomainEvents()` drena a fila (chamado pela camada application após persistência).
 *  - Nenhuma referência a infraestrutura nesta classe.
 */
class BaseAggregateRoot extends BaseEntity {
  /** @type {DomainEvent[]} */
  #domainEvents = [];

  /**
   * @param {string}      id
   * @param {Date|string} [createdAt]
   * @param {Date|string} [updatedAt]
   */
  constructor(id, createdAt, updatedAt) {
    super(id, createdAt, updatedAt);
  }

  // ── Eventos de domínio ─────────────────────────────────────────

  /**
   * Registra um evento de domínio na fila interna.
   * @protected
   * @param {DomainEvent} event
   */
  _raise(event) {
    if (!(event instanceof DomainEvent)) {
      throw new TypeError(`${this.constructor.name}._raise: argumento deve ser DomainEvent`);
    }
    this.#domainEvents.push(event);
  }

  /**
   * Retorna todos os eventos acumulados e esvazia a fila.
   * Deve ser chamado pela camada application após `repository.save()`.
   * @returns {DomainEvent[]}
   */
  pullDomainEvents() {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }

  /**
   * Apenas para leitura — não esvazia a fila.
   * @returns {readonly DomainEvent[]}
   */
  get domainEvents() {
    return Object.freeze([...this.#domainEvents]);
  }
}

module.exports = { BaseAggregateRoot };
