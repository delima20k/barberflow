'use strict';

/**
 * ICache — Interface (port) para camada de cache.
 * @interface
 */
class ICache {
  /**
   * @param {string} key
   * @returns {Promise<unknown|null>}
   */
  async get(key) { throw new Error(`${this.constructor.name}.get() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string}  key
   * @param {unknown} value
   * @param {number}  [ttlSeconds]
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds) { throw new Error(`${this.constructor.name}.set() não implementado`); } // eslint-disable-line no-unused-vars

  /**
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
   * @returns {Promise<void>}
   */
  async flush() { throw new Error(`${this.constructor.name}.flush() não implementado`); }
}

module.exports = { ICache };
