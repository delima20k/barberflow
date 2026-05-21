'use strict';

const { randomUUID }    = require('node:crypto');
const { IQueueService } = require('../../domain/shared/ports/IQueueService');
const { Job }           = require('../../application/shared/Job');

/**
 * InMemoryQueueService — Implementação in-process de IQueueService para testes.
 *
 * Não requer Redis nem BullMQ. Semântica idêntica ao BullMQAdapter:
 *   - Dedup por jobId (Set em memória)
 *   - Processamento por prioridade (menor número = maior urgência)
 *   - Retry automático: job volta para a fila se attempts < maxAttempts
 *   - DLQ local: jobs exauridos vão para #dlq
 *   - Métricas: enqueued, processed, failed por fila
 *
 * Uso em testes:
 *   const q = new InMemoryQueueService();
 *   q.registerHandler(handler);
 *   await q.enqueue(QUEUES.MEDIA, JOB_TYPES.PROCESS_MEDIA, payload);
 *   const results = await q.processAll(QUEUES.MEDIA);
 */
class InMemoryQueueService extends IQueueService {
  /** @type {Map<string, Job[]>} */
  #queues = new Map();
  /** @type {Map<string, import('../../application/shared/JobHandler').JobHandler>} */
  #handlers = new Map();
  /** @type {Set<string>} jobIds já processados com sucesso (dedupe) */
  #processedIds = new Set();
  /** @type {Map<string, Job[]>} DLQ por fila */
  #dlq = new Map();
  /** @type {Map<string, { enqueued: number, processed: number, failed: number }>} */
  #metrics = new Map();

  /**
   * Registra um handler para um tipo de job.
   * @param {import('../../application/shared/JobHandler').JobHandler} handler
   */
  registerHandler(handler) {
    if (!handler || typeof handler.jobType !== 'string')
      throw new TypeError('InMemoryQueueService: handler.jobType deve ser string');
    this.#handlers.set(handler.jobType, handler);
    return this;
  }

  async enqueue(queueName, jobType, payload, options = {}) {
    const id = options.jobId ?? randomUUID();

    // Dedupe: jobId já processado com sucesso
    if (this.#processedIds.has(id)) return { id, deduplicated: true };

    // Dedupe: jobId já está aguardando na fila
    const queue = this.#getQueue(queueName);
    if (queue.some(j => j.id === id)) return { id, deduplicated: true };

    const result = Job.create({
      id,
      type:        jobType,
      queue:       queueName,
      payload:     payload ?? {},
      priority:    options.priority    ?? 5,
      maxAttempts: options.maxAttempts ?? 3,
    });
    if (!result.isOk()) throw new Error(`InMemoryQueueService.enqueue: ${result.getError()}`);

    queue.push(result.getValue());
    this.#getMetrics(queueName).enqueued++;

    return { id, deduplicated: false };
  }

  /**
   * Processa todos os jobs atualmente na fila.
   * Jobs em retry ficam na fila e serão processados na PRÓXIMA chamada.
   *
   * @param {string} queueName
   * @returns {Promise<Array<{ jobId: string, status: 'ok'|'retry'|'dlq'|'deduplicated'|'no_handler', error?: string, attempts?: number }>>}
   */
  async processAll(queueName) {
    const queue = this.#getQueue(queueName);
    if (queue.length === 0) return [];

    // Snapshot — processa apenas os jobs que estavam presentes no início da chamada
    const snapshot = queue.splice(0, queue.length);
    // Ordenar por prioridade (menor = mais urgente)
    snapshot.sort((a, b) => a.priority - b.priority);

    const results = [];
    for (const job of snapshot) {
      if (this.#processedIds.has(job.id)) {
        results.push({ jobId: job.id, status: 'deduplicated' });
        continue;
      }

      const handler = this.#handlers.get(job.type);
      if (!handler) {
        results.push({ jobId: job.id, status: 'no_handler' });
        continue;
      }

      try {
        await handler.handle(job);
        await handler.onSuccess(job).catch(() => {});
        this.#processedIds.add(job.id);
        this.#getMetrics(queueName).processed++;
        results.push({ jobId: job.id, status: 'ok' });
      } catch (err) {
        const failed = job.fail(err.message);

        if (!failed.isExhausted) {
          // Retorna para a fila — será processado na próxima chamada
          queue.push(failed);
          results.push({ jobId: job.id, status: 'retry', attempts: failed.attempts });
        } else {
          await handler.onFailure(failed, err).catch(() => {});
          this.#getDLQ(queueName).push(failed);
          this.#getMetrics(queueName).failed++;
          results.push({ jobId: job.id, status: 'dlq', error: err.message });
        }
      }
    }

    return results;
  }

  /**
   * Processa jobs até a fila estar vazia (incluindo retries).
   * Evita loops infinitos: máximo de rounds = sum(maxAttempts) de todos os jobs.
   *
   * @param {string} queueName
   * @param {number} [maxRounds=20]
   * @returns {Promise<Array>}
   */
  async processUntilEmpty(queueName, maxRounds = 20) {
    const all = [];
    let rounds = 0;
    while (this.#getQueue(queueName).length > 0 && rounds < maxRounds) {
      const batch = await this.processAll(queueName);
      all.push(...batch);
      rounds++;
    }
    return all;
  }

  async getMetrics(queueName) {
    return { ...this.#getMetrics(queueName) };
  }

  async getDLQ(queueName) {
    return this.#getDLQ(queueName).map(j => ({
      id:          j.id,
      type:        j.type,
      payload:     j.payload,
      failedReason: j.failedReason,
      attempts:    j.attempts,
    }));
  }

  async retryFailed(queueName, jobId) {
    const dlq = this.#getDLQ(queueName);
    const idx = dlq.findIndex(j => j.id === jobId);
    if (idx === -1) throw new Error(`Job ${jobId} não encontrado na DLQ de ${queueName}`);
    const [job] = dlq.splice(idx, 1);
    const retried = Job.create({ ...job.toJSON(), attempts: 0, failedReason: null, processedAt: null });
    if (!retried.isOk()) throw new Error(retried.getError());
    this.#getQueue(queueName).push(retried.getValue());
    return { retried: true };
  }

  /** Retorna jobs pendentes de uma fila (snapshot). */
  getPending(queueName) {
    return [...this.#getQueue(queueName)];
  }

  /** Limpa todo estado — útil em afterEach de testes. */
  reset() {
    this.#queues.clear();
    this.#processedIds.clear();
    this.#dlq.clear();
    this.#metrics.clear();
  }

  // ── Helpers privados ────────────────────────────────────────────

  #getQueue(name) {
    if (!this.#queues.has(name)) this.#queues.set(name, []);
    return this.#queues.get(name);
  }

  #getDLQ(name) {
    if (!this.#dlq.has(name)) this.#dlq.set(name, []);
    return this.#dlq.get(name);
  }

  #getMetrics(name) {
    if (!this.#metrics.has(name)) this.#metrics.set(name, { enqueued: 0, processed: 0, failed: 0 });
    return this.#metrics.get(name);
  }
}

module.exports = { InMemoryQueueService };
