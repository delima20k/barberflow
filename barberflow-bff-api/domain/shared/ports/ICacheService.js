'use strict';

/**
 * ICacheService — Port de alto nível para o serviço de cache distribuído.
 *
 * Regras:
 *  - Vive no domínio; nunca importa de infrastructure ou application.
 *  - Expõe operações semânticas (getOrCompute, tags) além do CRUD básico.
 *  - Implementado por adapters na camada de infrastructure.
 *
 * @interface
 */
class ICacheService {
  /**
   * Retorna o valor se disponível no cache.
   * @param {string} key
   * @returns {Promise<unknown|null>}
   */
  async get(key) { throw new Error(`${this.constructor.name}.get() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * Armazena um valor com TTL opcional.
   * @param {string}  key
   * @param {unknown} value
   * @param {number}  [ttlSeconds]  0 = sem expiração
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds) { throw new Error(`${this.constructor.name}.set() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * Remove uma chave específica.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key) { throw new Error(`${this.constructor.name}.del() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * Remove todas as chaves que iniciam com o prefixo.
   * @param {string} prefix
   * @returns {Promise<void>}
   */
  async delByPrefix(prefix) { throw new Error(`${this.constructor.name}.delByPrefix() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * Retorna o valor se disponível; caso contrário, executa computeFn,
   * armazena o resultado e o retorna.
   * Implementações devem garantir proteção contra cache stampede.
   *
   * @param {string}              key
   * @param {() => Promise<unknown>} computeFn  Produz o valor quando há cache miss
   * @param {number}              [ttlSeconds]
   * @returns {Promise<unknown>}
   */
  async getOrCompute(key, computeFn, ttlSeconds) { throw new Error(`${this.constructor.name}.getOrCompute() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * Retorna o snapshot de métricas atuais do serviço.
   * @returns {{ hits: number, misses: number, evictions: number, hitRatio: number, avgLatencyMs: number }}
   */
  getMetrics() { throw new Error(`${this.constructor.name}.getMetrics() não implementado`); }
}

module.exports = { ICacheService };
