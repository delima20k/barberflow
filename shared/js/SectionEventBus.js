'use strict';

class SectionEventBus {
  #catalog;
  #dev;
  #listeners = new Map();

  constructor({ catalog, dev = false } = {}) {
    if (!catalog || typeof catalog.has !== 'function') {
      throw new Error('SectionEventBus requer catalogo de eventos.');
    }
    this.#catalog = catalog;
    this.#dev = dev === true;
  }

  on(eventName, handler) {
    this.#validarEvento(eventName);
    if (typeof handler !== 'function') {
      throw new Error('SectionEventBus requer handler valido.');
    }
    const handlers = this.#listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    this.#listeners.set(eventName, handlers);
    return this.#remover.bind(this, eventName, handler);
  }

  emit(eventName, payload) {
    this.#validarEvento(eventName);
    this.#listeners.get(eventName)?.forEach(handler => handler(payload));
  }

  listenerCount(eventName = null) {
    if (eventName) return this.#listeners.get(eventName)?.size ?? 0;
    return [...this.#listeners.values()].reduce((total, handlers) => total + handlers.size, 0);
  }

  #validarEvento(eventName) {
    if (this.#dev && !this.#catalog.has(eventName)) {
      throw new Error(`Evento fora do catalogo Section: ${eventName}`);
    }
  }

  #remover(eventName, handler) {
    const handlers = this.#listeners.get(eventName);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) this.#listeners.delete(eventName);
  }
}
