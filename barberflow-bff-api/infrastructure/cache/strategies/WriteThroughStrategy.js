'use strict';

/**
 * WriteThroughStrategy — Escrita síncrona em cache E fonte simultaneamente.
 *
 * Fluxo de leitura:
 *   Idêntico ao CacheAside (cache hit → retorna; miss → busca + popula).
 *
 * Fluxo de escrita:
 *   cache + fonte em PARALELO (`Promise.all`).
 *   O caller aguarda ambas completarem antes de prosseguir.
 *   O cache é sempre consistente com a fonte após a escrita.
 *
 * Quando usar:
 *   - Dados críticos onde leitura pós-escrita deve ser instantânea.
 *   - Ex.: status de agendamento, confirmação de presença na fila.
 *   - Tolerância ZERO a stale data após mutação do recurso.
 *
 * Risco:
 *   - Latência de escrita levemente maior (paralelo ao DB).
 *   - Se a escrita no DB falhar mas no cache tiver sucesso → inconsistência.
 *     Mitigado: em caso de erro do DB, invalidar a chave do cache.
 */
class WriteThroughStrategy {
  /** @type {import('../SingleFlightCache').SingleFlightCache} */
  #cache;
  /** @type {import('../CacheMetrics').CacheMetrics} */
  #metrics;

  /**
   * @param {{
   *   cache:   import('../SingleFlightCache').SingleFlightCache,
   *   metrics: import('../CacheMetrics').CacheMetrics
   * }} deps
   */
  constructor({ cache, metrics }) {
    if (!cache)   throw new TypeError('WriteThroughStrategy: cache é obrigatório');
    if (!metrics) throw new TypeError('WriteThroughStrategy: metrics é obrigatório');
    this.#cache   = cache;
    this.#metrics = metrics;
  }

  /**
   * Leitura — igual ao cache-aside.
   * @param {string}                key
   * @param {() => Promise<unknown>} fetchFn
   * @param {number}                [ttlSeconds]
   * @returns {Promise<unknown>}
   */
  async read(key, fetchFn, ttlSeconds) {
    return this.#cache.getOrCompute(key, fetchFn, ttlSeconds);
  }

  /**
   * Escrita síncrona em cache + fonte.
   *
   * @param {string}                key
   * @param {unknown}               value         Valor já calculado/serializado
   * @param {(v: unknown) => Promise<void>} persistFn  Persiste na fonte (DB, API)
   * @param {number}                [ttlSeconds]
   * @returns {Promise<void>}
   */
  async write(key, value, persistFn, ttlSeconds) {
    try {
      await Promise.all([
        this.#cache.set(key, value, ttlSeconds),
        persistFn(value),
      ]);
    } catch (err) {
      // Se qualquer escrita falhou, remover do cache para evitar dados parciais
      await this.#cache.del(key).catch(() => {});
      this.#metrics.recordEviction();
      throw err;
    }
  }

  /**
   * @param {string} key
   */
  async invalidate(key) {
    await this.#cache.del(key);
    this.#metrics.recordEviction();
  }

  /**
   * @param {string} prefix
   */
  async invalidateByPrefix(prefix) {
    await this.#cache.delByPrefix(prefix);
    this.#metrics.recordEviction();
  }
}

module.exports = { WriteThroughStrategy };
