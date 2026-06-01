'use strict';

/**
 * DeadLetterQueue — Observador e armazenamento de jobs que exauriram tentativas.
 *
 * Jobs são persistidos no Redis com TTL de 7 dias para inspeção e replay manual.
 * Chave: bf:dlq:<queueName>:<jobId>
 *
 * Integra com o cache distribuído (ICache) — não depende diretamente de BullMQ,
 * portanto funciona com InMemoryQueueService em testes.
 */
class DeadLetterQueue {
  #cache;
  static #PREFIX = 'bf:dlq';
  static #TTL_SECONDS = 604_800; // 7 dias

  /**
   * @param {{ cache: import('../cache/ICache').ICache }} deps
   */
  constructor({ cache }) {
    if (!cache) throw new TypeError('DeadLetterQueue: cache é obrigatório');
    this.#cache = cache;
  }

  /**
   * Persiste um job exaurido na DLQ.
   * @param {import('../../application/shared/Job').Job} job
   * @returns {Promise<void>}
   */
  async push(job) {
    const key = `${DeadLetterQueue.#PREFIX}:${job.queue}:${job.id}`;
    await this.#cache.set(key, {
      jobId:        job.id,
      jobType:      job.type,
      queue:        job.queue,
      payload:      job.payload,
      failedReason: job.failedReason,
      attempts:     job.attempts,
      maxAttempts:  job.maxAttempts,
      failedAt:     new Date().toISOString(),
    }, DeadLetterQueue.#TTL_SECONDS);
  }

  /**
   * Recupera um job específico da DLQ.
   * @param {string} queueName
   * @param {string} jobId
   * @returns {Promise<object|null>}
   */
  async get(queueName, jobId) {
    const key = `${DeadLetterQueue.#PREFIX}:${queueName}:${jobId}`;
    return this.#cache.get(key);
  }

  /**
   * Remove um job da DLQ (após replay manual bem-sucedido).
   * @param {string} queueName
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  async remove(queueName, jobId) {
    const key = `${DeadLetterQueue.#PREFIX}:${queueName}:${jobId}`;
    await this.#cache.del(key);
  }

  /**
   * Remove todos os jobs de uma fila da DLQ.
   * @param {string} queueName
   * @returns {Promise<void>}
   */
  async purge(queueName) {
    const prefix = `${DeadLetterQueue.#PREFIX}:${queueName}:`;
    await this.#cache.delByPrefix(prefix);
  }

  static get PREFIX() { return DeadLetterQueue.#PREFIX; }
}

module.exports = { DeadLetterQueue };
