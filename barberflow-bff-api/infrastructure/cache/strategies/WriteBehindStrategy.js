'use strict';

/**
 * WriteBehindStrategy — Escrita imediata no cache; persistência assíncrona.
 *
 * Fluxo de leitura:
 *   Idêntico ao CacheAside.
 *
 * Fluxo de escrita:
 *   1. Escreve no cache imediatamente (resposta rápida ao caller).
 *   2. Agenda a persistência via `setImmediate` (fire-and-forget com retry).
 *
 * Quando usar:
 *   - Dados com alta taxa de escrita onde a latência de persistência é inaceitável.
 *   - Ex.: contagens de visitas, métricas de uso, logs de acesso.
 *   - NUNCA usar para dados financeiros, agendamentos ou qualquer dado crítico.
 *
 * Riscos (LEIA ANTES DE USAR):
 *   ⚠ Perda de dados: se o processo crashar antes do setImmediate rodar, a escrita se perde.
 *   ⚠ Inconsistência: leitores de outro processo podem ver dado stale do banco.
 *   ⚠ Ordering: escritas fora de ordem podem sobrescrever versões mais recentes.
 *
 * Mitigações implementadas:
 *   - Máx. 3 tentativas de persistência com backoff linear.
 *   - Erro fatal registrado via logger (sem silêncio).
 */
class WriteBehindStrategy {
  /** @type {import('../SingleFlightCache').SingleFlightCache} */
  #cache;
  /** @type {import('../CacheMetrics').CacheMetrics} */
  #metrics;

  static #MAX_RETRIES = 3;
  static #RETRY_DELAY_MS = 200;

  /**
   * @param {{
   *   cache:   import('../SingleFlightCache').SingleFlightCache,
   *   metrics: import('../CacheMetrics').CacheMetrics
   * }} deps
   */
  constructor({ cache, metrics }) {
    if (!cache)   throw new TypeError('WriteBehindStrategy: cache é obrigatório');
    if (!metrics) throw new TypeError('WriteBehindStrategy: metrics é obrigatório');
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
   * Escreve imediatamente no cache e agenda persistência assíncrona.
   *
   * @param {string}                key
   * @param {unknown}               value
   * @param {(v: unknown) => Promise<void>} persistFn
   * @param {number}                [ttlSeconds]
   * @returns {Promise<void>}   Resolve após cache set (não aguarda persistência)
   */
  async write(key, value, persistFn, ttlSeconds) {
    await this.#cache.set(key, value, ttlSeconds);

    // Persistência assíncrona — não bloqueia o caller
    setImmediate(() => this.#persistWithRetry(persistFn, value, key));
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

  // ── Internos ───────────────────────────────────────────────────

  /**
   * @param {Function} persistFn
   * @param {unknown}  value
   * @param {string}   key
   */
  async #persistWithRetry(persistFn, value, key) {
    for (let attempt = 1; attempt <= WriteBehindStrategy.#MAX_RETRIES; attempt++) {
      try {
        await persistFn(value);
        return;
      } catch (err) {
        if (attempt === WriteBehindStrategy.#MAX_RETRIES) {
          // Falha definitiva — remove do cache para forçar leitura fresh
          await this.#cache.del(key).catch(() => {});
          this.#metrics.recordEviction();
          // eslint-disable-next-line no-console
          console.error(`[WriteBehindStrategy] Persistência falhou definitivamente para chave "${key}" após ${attempt} tentativas:`, err?.message ?? err);
          return;
        }
        await this.#delay(WriteBehindStrategy.#RETRY_DELAY_MS * attempt);
      }
    }
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { WriteBehindStrategy };
