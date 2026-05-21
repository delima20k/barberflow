'use strict';

const { ICache } = require('./ICache');

/**
 * MemoryCache — Implementação em memória do ICache.
 * Adequado para desenvolvimento local e testes; não compartilhado entre processos.
 */
class MemoryCache extends ICache {
  /** @type {Map<string, { value: unknown, expiresAt: number|null }>} */
  #store = new Map();

  async get(key) {
    const entry = this.#store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds) {
    const expiresAt = ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null;
    this.#store.set(key, { value, expiresAt });
  }

  async del(key) {
    this.#store.delete(key);
  }

  async delByPrefix(prefix) {
    for (const key of this.#store.keys()) {
      if (key.startsWith(prefix)) this.#store.delete(key);
    }
  }

  async flush() {
    this.#store.clear();
  }

  /** @returns {number} Número de entradas vivas na store. */
  get size() {
    return this.#store.size;
  }
}

module.exports = { MemoryCache };
