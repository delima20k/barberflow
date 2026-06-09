'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID }        = require('node:crypto');

/**
 * CorrelationContext — propagação de correlationId/traceId via AsyncLocalStorage.
 *
 * Garante rastreabilidade ponta-a-ponta sem passar IDs como parâmetro:
 *   HTTP request → use case → repositório → cache → fila → worker.
 *
 * Store: { correlationId, traceId, requestId, userId, diagnostics }
 *
 * Uso:
 *   CorrelationContext.run({ correlationId, traceId }, () => { ...código async... });
 *   CorrelationContext.correlationId  // acessa de qualquer ponto do call stack
 */
class CorrelationContext {
  static #storage = new AsyncLocalStorage();

  /**
   * Executa fn dentro de um novo contexto de correlação.
   * Campos não fornecidos são gerados automaticamente.
   *
   * @param {{ correlationId?: string, traceId?: string, requestId?: string, userId?: string, diagnostics?: object }} initial
   * @param {() => void} fn
   */
  static run(initial, fn) {
    const store = {
      correlationId: initial.correlationId ?? randomUUID(),
      traceId:       initial.traceId       ?? randomUUID().replace(/-/g, ''),
      requestId:     initial.requestId     ?? randomUUID(),
      userId:        initial.userId        ?? null,
      diagnostics:   initial.diagnostics   ?? null,
    };
    return CorrelationContext.#storage.run(store, fn);
  }

  /**
   * Retorna o store atual. Objeto vazio fora de contexto (nunca lança).
   * @returns {{ correlationId?: string, traceId?: string, requestId?: string, userId?: string, diagnostics?: object }}
   */
  static getStore() {
    return CorrelationContext.#storage.getStore() ?? {};
  }

  /** @returns {string|null} */
  static get correlationId() { return CorrelationContext.getStore().correlationId ?? null; }

  /** @returns {string|null} */
  static get traceId() { return CorrelationContext.getStore().traceId ?? null; }

  /** @returns {string|null} */
  static get requestId() { return CorrelationContext.getStore().requestId ?? null; }

  /** @returns {string|null} */
  static get userId() { return CorrelationContext.getStore().userId ?? null; }

  /**
   * Atualiza userId no store ativo. No-op fora de contexto.
   * @param {string} userId
   */
  static setUserId(userId) {
    const store = CorrelationContext.#storage.getStore();
    if (store) store.userId = userId;
  }

  /**
   * Registra uma medicao diagnostica no store ativo. No-op fora de contexto
   * ou quando diagnostico nao esta habilitado para a request.
   * @param {object} timing
   */
  static addDiagnosticTiming(timing) {
    const store = CorrelationContext.#storage.getStore();
    if (!store?.diagnostics?.enabled) return;
    if (!Array.isArray(store.diagnostics.timings)) store.diagnostics.timings = [];
    store.diagnostics.timings.push(timing);
  }

  /** @returns {object|null} */
  static get diagnostics() {
    return CorrelationContext.getStore().diagnostics ?? null;
  }
}

module.exports = { CorrelationContext };
