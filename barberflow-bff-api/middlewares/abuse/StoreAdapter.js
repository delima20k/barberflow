'use strict';

/**
 * StoreAdapter — interface para operações atômicas de contadores.
 * Implementações: InMemoryStore (dev/test), RedisStore (prod).
 */
class StoreAdapter {
  /** @param {string} key @returns {Promise<number>} */
  async incr(key)                     { throw new Error('not implemented'); }
  /** @param {string} key @param {number} ttlMs @returns {Promise<void>} */
  async expireIfNew(key, ttlMs)       { throw new Error('not implemented'); }
  /** @param {string} key @returns {Promise<number|null>} */
  async get(key)                      { throw new Error('not implemented'); }
  /** @param {string} key @param {number|string} value @param {number} [ttlMs] @returns {Promise<void>} */
  async set(key, value, ttlMs)        { throw new Error('not implemented'); }
  /** @param {string} key @returns {Promise<void>} */
  async del(key)                      { throw new Error('not implemented'); }
}

/**
 * InMemoryStore — implementação em memória para dev/test.
 * Thread-safe no contexto single-threaded do Node.js.
 */
class InMemoryStore extends StoreAdapter {
  #data = new Map(); // key → { value, expMs: number|null }

  #getRaw(key) {
    const entry = this.#data.get(key);
    if (!entry) return null;
    if (entry.expMs !== null && Date.now() > entry.expMs) { this.#data.delete(key); return null; }
    return entry;
  }

  async incr(key) {
    const existing = this.#getRaw(key);
    const current  = existing ? Number(existing.value) : 0;
    const next     = current + 1;
    // Preserva expMs já configurado; null se ainda não expirou
    this.#data.set(key, { value: next, expMs: existing?.expMs ?? null });
    return next;
  }

  async expireIfNew(key, ttlMs) {
    const entry = this.#data.get(key);
    // Só define TTL se a entrada existe e ainda não tem expiração
    if (entry && entry.expMs === null) entry.expMs = Date.now() + ttlMs;
  }

  async get(key) {
    const entry = this.#getRaw(key);
    return entry ? entry.value : null; // retorna o valor como armazenado (string ou number)
  }

  async set(key, value, ttlMs) {
    this.#data.set(key, { value, expMs: ttlMs ? Date.now() + ttlMs : null });
  }

  async del(key) { this.#data.delete(key); }

  /** Para testes: retorna snapshot das chaves vivas. */
  snapshot() {
    const out = new Map();
    for (const [k, v] of this.#data) {
      if (v.expMs === null || Date.now() <= v.expMs) out.set(k, v.value);
    }
    return out;
  }

  /** Para testes: limpa todo o store. */
  clear() { this.#data.clear(); }
}

/**
 * RedisStore — implementação via ioredis para produção.
 * Mantém a mesma interface do InMemoryStore.
 */
class RedisStore extends StoreAdapter {
  #redis;

  /** @param {import('ioredis').Redis} redis */
  constructor(redis) { super(); this.#redis = redis; }

  async incr(key) { return this.#redis.incr(key); }

  async expireIfNew(key, ttlMs) {
    try {
      // PEXPIRE NX: só define se não tiver expiração (Redis >= 7)
      await this.#redis.pexpire(key, ttlMs, 'NX');
    } catch {
      // Redis < 7 não suporta NX — fallback sem condição
      await this.#redis.pexpire(key, ttlMs);
    }
  }

  async get(key) {
    return this.#redis.get(key); // Redis retorna string — o caller converte se necessário
  }

  async set(key, value, ttlMs) {
    if (ttlMs) await this.#redis.set(key, value, 'PX', ttlMs);
    else await this.#redis.set(key, value);
  }

  async del(key) { await this.#redis.del(key); }
}

module.exports = { StoreAdapter, InMemoryStore, RedisStore };
