'use strict';

/**
 * DomainEventPublisher — Barramento de eventos de domínio (pub/sub em memória).
 *
 * Singleton: um único bus por processo.
 * Handlers são síncronos (chamados em sequência) e podem retornar Promises,
 * mas erros em handlers isolados não interrompem os demais.
 *
 * Integração com use cases:
 *   Após `agendamento.pullDomainEvents()`, passar os eventos para `publishAll()`.
 *   Isso desacopla o use case dos subscribers (cache, notificações, auditoria).
 *
 * Exemplo:
 *   const bus = DomainEventPublisher.getInstance();
 *   bus.subscribe('AgendamentoCriado', async e => console.log(e));
 *   bus.publishAll(agendamento.pullDomainEvents());
 */
class DomainEventPublisher {
  /** @type {DomainEventPublisher|null} */
  static #instance = null;

  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map();

  /** @private */
  constructor() {}

  /** @returns {DomainEventPublisher} */
  static getInstance() {
    if (!DomainEventPublisher.#instance) {
      DomainEventPublisher.#instance = new DomainEventPublisher();
    }
    return DomainEventPublisher.#instance;
  }

  /** Limpa o singleton (apenas para testes). */
  static _reset() {
    DomainEventPublisher.#instance = null;
  }

  // ── Subscription ───────────────────────────────────────────────

  /**
   * @param {string}   eventName  Nome do evento (ex.: 'AgendamentoCriado')
   * @param {Function} handler    `async (event: DomainEvent) => void`
   */
  subscribe(eventName, handler) {
    if (!this.#handlers.has(eventName)) {
      this.#handlers.set(eventName, new Set());
    }
    this.#handlers.get(eventName).add(handler);
  }

  /**
   * @param {string}   eventName
   * @param {Function} handler
   */
  unsubscribe(eventName, handler) {
    this.#handlers.get(eventName)?.delete(handler);
  }

  // ── Publication ────────────────────────────────────────────────

  /**
   * Publica um único evento para todos os subscribers registrados.
   * Erros em handlers individuais são capturados e logados sem propagar.
   * @param {import('../../domain/shared/DomainEvent').DomainEvent} event
   */
  async publish(event) {
    const handlers = this.#handlers.get(event.eventName);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[DomainEventPublisher] Erro no handler de "${event.eventName}":`, err?.message ?? err);
      }
    }
  }

  /**
   * Publica múltiplos eventos em sequência.
   * @param {import('../../domain/shared/DomainEvent').DomainEvent[]} events
   */
  async publishAll(events) {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /** @returns {string[]} Nomes de eventos com subscribers registrados. */
  get subscribedEvents() {
    return [...this.#handlers.keys()];
  }
}

module.exports = { DomainEventPublisher };
