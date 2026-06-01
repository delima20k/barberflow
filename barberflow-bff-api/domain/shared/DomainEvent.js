'use strict';

const { randomUUID } = require('crypto');

/**
 * DomainEvent — Evento imutável que representa algo que aconteceu no domínio.
 *
 * Regras:
 *  - Eventos são imutáveis após criação (Object.freeze).
 *  - O nome do evento deve ser no passado (ex: AgendamentoCriado).
 *  - aggregateId identifica o agregado que originou o evento.
 */
class DomainEvent {
  /** @type {string} */ #eventId;
  /** @type {string} */ #eventName;
  /** @type {string} */ #aggregateId;
  /** @type {Date}   */ #occurredAt;

  /**
   * @param {string} eventName   - Nome do evento (ex: 'AgendamentoCriado')
   * @param {string} aggregateId - ID do agregado originador
   */
  constructor(eventName, aggregateId) {
    if (!eventName || typeof eventName !== 'string') {
      throw new TypeError('DomainEvent: eventName deve ser uma string não-vazia');
    }
    if (!aggregateId || typeof aggregateId !== 'string') {
      throw new TypeError('DomainEvent: aggregateId deve ser uma string não-vazia');
    }

    this.#eventId      = randomUUID();
    this.#eventName    = eventName;
    this.#aggregateId  = aggregateId;
    this.#occurredAt   = new Date();

    Object.freeze(this);
  }

  /** @returns {string} */
  get eventId()     { return this.#eventId; }

  /** @returns {string} */
  get eventName()   { return this.#eventName; }

  /** @returns {string} */
  get aggregateId() { return this.#aggregateId; }

  /** @returns {Date} */
  get occurredAt()  { return this.#occurredAt; }

  /** @returns {{ eventId: string, eventName: string, aggregateId: string, occurredAt: string }} */
  toJSON() {
    return {
      eventId:     this.#eventId,
      eventName:   this.#eventName,
      aggregateId: this.#aggregateId,
      occurredAt:  this.#occurredAt.toISOString(),
    };
  }
}

module.exports = { DomainEvent };
