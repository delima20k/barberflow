'use strict';

/**
 * DynamicList — listas de allow/deny por userId ou IP com TTL configurável.
 * Suporta todas as ações da enum Action (allow, challenge, throttle, soft_block, hard_block).
 */
class DynamicList {
  #entries = new Map(); // key → { action: string, expMs: number|null }

  /**
   * Adiciona (ou sobrescreve) uma entrada com TTL.
   * @param {string} key    — userId ou IP
   * @param {string} action — da enum Action
   * @param {number} [ttlMs=0] — 0 = permanente
   * @returns {this}
   */
  add(key, action, ttlMs = 0) {
    this.#entries.set(key, {
      action,
      expMs: ttlMs > 0 ? Date.now() + ttlMs : null,
    });
    return this;
  }

  /**
   * Remove uma entrada.
   * @param {string} key @returns {this}
   */
  remove(key) { this.#entries.delete(key); return this; }

  /**
   * Verifica se existe entrada válida para a chave.
   * @param {string} key
   * @returns {{ action: string }|null}
   */
  check(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expMs !== null && Date.now() > entry.expMs) {
      this.#entries.delete(key);
      return null;
    }
    return { action: entry.action };
  }

  /** Remove entradas expiradas (garbage collection). */
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.#entries) {
      if (entry.expMs !== null && now > entry.expMs) this.#entries.delete(key);
    }
    return this;
  }

  /** Retorna contagem de entradas válidas (chama sweep internamente). */
  size() { this.sweep(); return this.#entries.size; }

  /** Para testes: esvazia a lista. */
  clear() { this.#entries.clear(); return this; }
}

module.exports = { DynamicList };
