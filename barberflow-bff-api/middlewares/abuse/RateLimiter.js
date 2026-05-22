'use strict';

const { InMemoryStore } = require('./StoreAdapter');

/**
 * RateLimiterStrategy — interface base das estratégias de rate limit (padrão Strategy).
 */
class RateLimiterStrategy {
  /**
   * Consome 1 token/slot para a chave dada.
   * @param {string} key
   * @returns {Promise<{allowed: boolean, remaining: number, resetMs: number}>}
   */
  async consume(key) { throw new Error('consume() não implementado'); }

  /**
   * Reseta o contador para a chave dada.
   * @param {string} key @returns {Promise<void>}
   */
  async reset(key)   { throw new Error('reset() não implementado'); }
}

/**
 * SlidingWindow — conta requisições em janela deslizante.
 * Mais preciso que fixed-window; sem burst no momento do reset.
 */
class SlidingWindow extends RateLimiterStrategy {
  #store;
  #windowMs;
  #max;

  /**
   * @param {object} opts
   * @param {import('./StoreAdapter').StoreAdapter} [opts.store]
   * @param {number} opts.windowMs — duração da janela em ms
   * @param {number} opts.max      — máximo de requisições por janela
   */
  constructor({ store, windowMs, max }) {
    super();
    this.#store    = store ?? new InMemoryStore();
    this.#windowMs = windowMs;
    this.#max      = max;
  }

  async consume(key) {
    const count     = await this.#store.incr(key);
    if (count === 1) await this.#store.expireIfNew(key, this.#windowMs);
    const allowed   = count <= this.#max;
    const remaining = Math.max(0, this.#max - count);
    return { allowed, remaining, resetMs: this.#windowMs };
  }

  async reset(key) { await this.#store.del(key); }
}

/**
 * TokenBucket — capacidade fixa com reposição gradual de tokens.
 * Permite burst até a capacidade máxima; previne sobrecarga sustentada.
 */
class TokenBucket extends RateLimiterStrategy {
  #store;
  #capacity;
  #refillRatePerMs; // tokens por ms

  /**
   * @param {object} opts
   * @param {import('./StoreAdapter').StoreAdapter} [opts.store]
   * @param {number} opts.capacity     — burst máximo de tokens
   * @param {number} opts.refillPerSec — tokens repostos por segundo
   */
  constructor({ store, capacity, refillPerSec }) {
    super();
    this.#store           = store ?? new InMemoryStore();
    this.#capacity        = capacity;
    this.#refillRatePerMs = refillPerSec / 1000;
  }

  async consume(key) {
    const stateKey = `${key}:tbstate`;
    const now      = Date.now();
    const raw      = await this.#store.get(stateKey);
    const state    = raw !== null
      ? JSON.parse(String(raw))
      : { tokens: this.#capacity, lastRefill: now };

    // Reabastece com base no tempo decorrido
    const elapsed  = now - state.lastRefill;
    const refilled = Math.min(this.#capacity, state.tokens + elapsed * this.#refillRatePerMs);
    const allowed  = refilled >= 1;
    const newState = { tokens: allowed ? refilled - 1 : refilled, lastRefill: now };

    await this.#store.set(stateKey, JSON.stringify(newState));

    const remaining = Math.max(0, Math.floor(newState.tokens));
    const resetMs   = allowed ? 0 : Math.ceil((1 - refilled) / this.#refillRatePerMs);
    return { allowed, remaining, resetMs };
  }

  async reset(key) { await this.#store.del(`${key}:tbstate`); }
}

/**
 * RateLimiter — contexto do padrão Strategy.
 * Delega consume/reset à strategy injetada.
 */
class RateLimiter {
  #strategy;

  /** @param {RateLimiterStrategy} strategy */
  constructor(strategy) {
    if (!(strategy instanceof RateLimiterStrategy)) {
      throw new TypeError('strategy deve ser RateLimiterStrategy');
    }
    this.#strategy = strategy;
  }

  /** @returns {Promise<{allowed: boolean, remaining: number, resetMs: number}>} */
  async consume(key) { return this.#strategy.consume(key); }

  /** @returns {Promise<void>} */
  async reset(key)   { return this.#strategy.reset(key); }
}

module.exports = { RateLimiterStrategy, SlidingWindow, TokenBucket, RateLimiter };
