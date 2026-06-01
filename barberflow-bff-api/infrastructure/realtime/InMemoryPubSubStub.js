'use strict';

const { IPubSubService } = require('../../domain/realtime/ports/IPubSubService');
const { RealtimeEvent }  = require('../../domain/realtime/RealtimeEvent');

/**
 * InMemoryPubSubStub — Implementação em memória de IPubSubService.
 *
 * Usada em desenvolvimento sem Redis e em testes unitários.
 * Entrega mensagens apenas no mesmo processo (sem fanout real entre instâncias).
 */
class InMemoryPubSubStub extends IPubSubService {
  /** @type {Map<string, Set<(event: object) => void>>} */
  #subscriptions = new Map();

  async subscribe(channel, callback) {
    if (!this.#subscriptions.has(channel)) {
      this.#subscriptions.set(channel, new Set());
    }
    this.#subscriptions.get(channel).add(callback);
  }

  async unsubscribe(channel) {
    this.#subscriptions.delete(channel);
  }

  async publish(channel, event) {
    const callbacks = this.#subscriptions.get(channel);
    if (!callbacks || callbacks.size === 0) return;

    const raw    = typeof event.toJSON === 'function' ? event.toJSON() : event;
    const result = RealtimeEvent.fromJSON(raw);
    if (result.isFailure) return;

    const ev = result.getValue();
    for (const cb of callbacks) {
      try { cb(ev); } catch { /* não propagar erros de callback */ }
    }
  }

  async disconnect() {
    this.#subscriptions.clear();
  }
}

module.exports = { InMemoryPubSubStub };
