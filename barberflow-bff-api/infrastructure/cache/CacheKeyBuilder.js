'use strict';

/**
 * CacheKeyBuilder — Constrói chaves de cache padronizadas.
 *
 * Formato: `bf:<context>:<entity>:<id>:<version>`
 *
 * Exemplos:
 *   bf:agendamento:agendamento:uuid-123:v1
 *   bf:agendamento:list:clienteId=uuid-456:v1
 *   bf:fila:count:barbershopId=uuid-789:v1
 *
 * Regras:
 *  - Namespace fixo "bf" — distingue chaves do BarberFlow em Redis compartilhado
 *  - Version "v1" — bump ao mudar schema; invalida todo cache anterior sem scripts
 *  - Params de lista são ordenados alfabeticamente — chave determinística
 */
class CacheKeyBuilder {
  static #NS  = 'bf';
  static #VER = 'v1';

  /**
   * Chave para um recurso singular.
   * @param {string} context  Ex: 'agendamento', 'fila', 'barbearia'
   * @param {string} entity   Ex: 'agendamento', 'entrada', 'barbershop'
   * @param {string} id       UUID ou identificador único
   * @param {string} [version]
   * @returns {string}
   */
  static build(context, entity, id, version = CacheKeyBuilder.#VER) {
    if (!context) throw new TypeError('CacheKeyBuilder.build: context obrigatório');
    if (!entity)  throw new TypeError('CacheKeyBuilder.build: entity obrigatório');
    if (!id)      throw new TypeError('CacheKeyBuilder.build: id obrigatório');
    return `${CacheKeyBuilder.#NS}:${context}:${entity}:${id}:${version}`;
  }

  /**
   * Chave para uma listagem com parâmetros de filtro.
   * @param {string}              context
   * @param {string}              entity
   * @param {Record<string,string|number|boolean>} [params]
   * @param {string}              [version]
   * @returns {string}
   */
  static buildList(context, entity, params = {}, version = CacheKeyBuilder.#VER) {
    if (!context) throw new TypeError('CacheKeyBuilder.buildList: context obrigatório');
    if (!entity)  throw new TypeError('CacheKeyBuilder.buildList: entity obrigatório');

    const paramStr = Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(';') || '*';

    return `${CacheKeyBuilder.#NS}:${context}:${entity}:list:${paramStr}:${version}`;
  }

  /**
   * Prefixo para invalidação em bloco (delByPrefix).
   * @param {string} context
   * @param {string} entity
   * @returns {string}
   */
  static prefix(context, entity) {
    return `${CacheKeyBuilder.#NS}:${context}:${entity}:`;
  }

  /**
   * Prefixo de contexto inteiro (invalida todos os recursos de um contexto).
   * @param {string} context
   * @returns {string}
   */
  static contextPrefix(context) {
    return `${CacheKeyBuilder.#NS}:${context}:`;
  }

  /**
   * Chave de idempotência para POST/PUT.
   * @param {string} idempotencyKey
   * @returns {string}
   */
  static idempotency(idempotencyKey) {
    return `${CacheKeyBuilder.#NS}:idempotency:${idempotencyKey}`;
  }
}

module.exports = { CacheKeyBuilder };
