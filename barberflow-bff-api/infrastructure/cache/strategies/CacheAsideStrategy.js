'use strict';

/**
 * CacheAsideStrategy — Estratégia lazy-load (leitura).
 *
 * Fluxo de leitura:
 *   cache hit  → retorna valor do cache
 *   cache miss → busca da fonte, popula cache, retorna
 *
 * Fluxo de escrita:
 *   escreve SOMENTE na fonte; cache é invalidado (não atualizado).
 *   Na próxima leitura, o cache será populado pelo fluxo de miss.
 *
 * Quando usar:
 *   - Dados lidos muito mais do que escritos.
 *   - Tolerância moderada a stale data (TTL controla a janela).
 *   - Qualquer contexto de leitura no BarberFlow (barbearias, serviços, perfil).
 *
 * Risco:
 *   - Thundering herd: múltiplos misses simultâneos podem sobrecarregar o DB.
 *     Mitigado combinando com SingleFlightCache.
 */
class CacheAsideStrategy {
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
    if (!cache)   throw new TypeError('CacheAsideStrategy: cache é obrigatório');
    if (!metrics) throw new TypeError('CacheAsideStrategy: metrics é obrigatório');
    this.#cache   = cache;
    this.#metrics = metrics;
  }

  /**
   * Leitura com cache-aside + single-flight.
   *
   * @param {string}                key
   * @param {() => Promise<unknown>} fetchFn  Função que busca na fonte (banco, API)
   * @param {number}                [ttlSeconds]
   * @returns {Promise<unknown>}
   */
  async read(key, fetchFn, ttlSeconds) {
    return this.#cache.getOrCompute(key, fetchFn, ttlSeconds);
  }

  /**
   * Invalida a chave após uma escrita na fonte.
   * @param {string} key
   */
  async invalidate(key) {
    await this.#cache.del(key);
    this.#metrics.recordEviction();
  }

  /**
   * Invalida todas as chaves de um prefixo (ex.: ao criar/remover um recurso).
   * @param {string} prefix
   */
  async invalidateByPrefix(prefix) {
    await this.#cache.delByPrefix(prefix);
    this.#metrics.recordEviction();
  }
}

module.exports = { CacheAsideStrategy };
