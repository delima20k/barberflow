'use strict';

/**
 * IQueueService — Port de alto nível para o serviço de filas distribuídas.
 *
 * Define o contrato sem acoplamento à implementação (BullMQ, SQS, etc.).
 * Toda a camada de application depende APENAS desta interface.
 *
 * Adapters que implementam este contrato:
 *   - BullMQAdapter   (produção — Redis/BullMQ)
 *   - InMemoryQueueService (testes — zero deps)
 */
class IQueueService {
  /**
   * Enfileira um job.
   * @param {string} queueName    — nome da fila (usar constantes QUEUES)
   * @param {string} jobType      — tipo do job (usar constantes JOB_TYPES)
   * @param {object} payload      — dados do job (serializável em JSON)
   * @param {object} [options]
   * @param {string} [options.jobId]       — ID determinístico para dedupe
   * @param {number} [options.priority]    — 1=alto, 10=baixo (default 5)
   * @param {number} [options.maxAttempts] — máximo de tentativas (default 3)
   * @param {number} [options.delayMs]     — atraso antes do primeiro processamento
   * @returns {Promise<{ id: string, deduplicated: boolean }>}
   */
  async enqueue(queueName, jobType, payload, options = {}) {
    throw new Error(`${this.constructor.name}.enqueue() não implementado`);
  }

  /**
   * Retorna métricas da fila (waiting, active, completed, failed, delayed).
   * @param {string} queueName
   * @returns {Promise<object>}
   */
  async getMetrics(queueName) {
    throw new Error(`${this.constructor.name}.getMetrics() não implementado`);
  }

  /**
   * Lista jobs na DLQ (falhos exauridos) da fila.
   * @param {string} queueName
   * @returns {Promise<Array<{ id: string, type: string, payload: object, failedReason: string, attempts: number }>>}
   */
  async getDLQ(queueName) {
    throw new Error(`${this.constructor.name}.getDLQ() não implementado`);
  }

  /**
   * Reenfileira um job da DLQ para nova tentativa.
   * @param {string} queueName
   * @param {string} jobId
   * @returns {Promise<{ retried: boolean }>}
   */
  async retryFailed(queueName, jobId) {
    throw new Error(`${this.constructor.name}.retryFailed() não implementado`);
  }

  /**
   * Fecha conexões e limpa recursos.
   * @returns {Promise<void>}
   */
  async close() {}
}

module.exports = { IQueueService };
