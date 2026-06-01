'use strict';

const { ICache }       = require('./ICache');
const { CacheMetrics } = require('./CacheMetrics');

/**
 * SingleFlightCache — Decorator de ICache com proteção contra cache stampede.
 *
 * Problema: quando o cache expira e N requisições simultâneas chegam ao mesmo
 * tempo, todas detectam miss e disparam a mesma computação cara ao banco.
 *
 * Solução (single-flight / request coalescing):
 *   - A primeira requisição inicia a computação e registra uma Promise em #inFlight.
 *   - As demais aguardam essa mesma Promise — apenas UMA chamada chega ao DB.
 *   - Quando a Promise resolve, todas as requisições recebem o resultado.
 *
 * Este decorator encapsula ICache e expõe `getOrCompute()` com a proteção.
 * Delega get/set/del/delByPrefix/flush para o cache interno sem alteração.
 */
class SingleFlightCache extends ICache {
  /** @type {ICache} */
  #inner;
  /** @type {CacheMetrics} */
  #metrics;
  /** @type {Map<string, Promise<unknown>>} */
  #inFlight = new Map();

  /**
   * @param {{ cache: ICache, metrics: CacheMetrics }} deps
   */
  constructor({ cache, metrics }) {
    super();
    if (!cache)   throw new TypeError('SingleFlightCache: cache é obrigatório');
    if (!metrics) throw new TypeError('SingleFlightCache: metrics é obrigatório');
    this.#inner   = cache;
    this.#metrics = metrics;
  }

  // ── Delegação transparente para ICache ────────────────────────

  async get(key)                    { return this.#inner.get(key); }
  async set(key, value, ttlSeconds) { return this.#inner.set(key, value, ttlSeconds); }
  async del(key)                    { return this.#inner.del(key); }
  async delByPrefix(prefix)         { return this.#inner.delByPrefix(prefix); }
  async flush()                     { return this.#inner.flush(); }

  // ── Single-flight ──────────────────────────────────────────────

  /**
   * Retorna o valor do cache se disponível.
   * Em cache miss: executa computeFn uma única vez mesmo com N chamadas simultâneas.
   *
   * @param {string}                key
   * @param {() => Promise<unknown>} computeFn
   * @param {number}                [ttlSeconds]
   * @returns {Promise<unknown>}
   */
  async getOrCompute(key, computeFn, ttlSeconds) {
    const t0 = Date.now();

    // 1. Tentar cache primeiro
    const cached = await this.#inner.get(key);
    if (cached !== null) {
      this.#metrics.recordHit(Date.now() - t0);
      return cached;
    }

    this.#metrics.recordMiss(Date.now() - t0);

    // 2. Já existe uma Promise em vôo para essa chave?
    if (this.#inFlight.has(key)) {
      return this.#inFlight.get(key);
    }

    // 3. Criar nova Promise e registrar como in-flight
    const promise = computeFn()
      .then(async value => {
        if (value !== null && value !== undefined) {
          await this.#inner.set(key, value, ttlSeconds);
        }
        this.#inFlight.delete(key);
        return value;
      })
      .catch(err => {
        this.#inFlight.delete(key);
        throw err;
      });

    this.#inFlight.set(key, promise);
    return promise;
  }

  /** @returns {{ hits: number, misses: number, evictions: number, hitRatio: number, avgLatencyMs: number }} */
  getMetrics() {
    return this.#metrics.getSnapshot();
  }

  /** @returns {number} Número de computações em andamento no momento. */
  get inFlightCount() {
    return this.#inFlight.size;
  }
}

module.exports = { SingleFlightCache };
