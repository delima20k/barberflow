'use strict';

const { Queue }         = require('bullmq');
const { IQueueService } = require('../../domain/shared/ports/IQueueService');

/**
 * BullMQAdapter — Adapter de produção que implementa IQueueService via BullMQ + Redis.
 *
 * Requer ioredis como peer dependency (instalado junto com bullmq).
 * Configuração da conexão via REDIS_URL ou objeto { host, port, password }.
 *
 * Filas são criadas lazily na primeira chamada a `enqueue()`.
 *
 * Dedupe nativa: BullMQ deduplica por jobId — se um job com o mesmo ID já
 * existe (waiting/active/delayed), a chamada é silenciosamente ignorada.
 *
 * DLQ: BullMQ armazena jobs falhos na própria fila. `getDLQ()` lista jobs
 * com estado 'failed'. `retryFailed()` reenfileira via `job.retry()`.
 */
class BullMQAdapter extends IQueueService {
  /** @type {Map<string, Queue>} */
  #queues = new Map();
  /** @type {object} ioredis connection options ou instância */
  #connection;

  /**
   * @param {{ redisConnection: object }} deps
   *   redisConnection — objeto com { host, port, password } ou instância ioredis
   */
  constructor({ redisConnection }) {
    super();
    if (!redisConnection) throw new TypeError('BullMQAdapter: redisConnection é obrigatório');
    this.#connection = redisConnection;
  }

  async enqueue(queueName, jobType, payload, options = {}) {
    const queue = this.#getQueue(queueName);

    const bullOptions = {
      priority:         options.priority ?? 5,
      attempts:         options.maxAttempts ?? 3,
      backoff:          options.backoff ?? { type: 'exponential', delay: 1_000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 500 },
      ...(options.jobId   ? { jobId: options.jobId } : {}),
      ...(options.delayMs ? { delay: options.delayMs } : {}),
    };

    const job = await queue.add(jobType, payload ?? {}, bullOptions);
    return { id: job.id, deduplicated: false };
  }

  async getMetrics(queueName) {
    const queue = this.#getQueue(queueName);
    return queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  }

  async getDLQ(queueName) {
    const queue = this.#getQueue(queueName);
    const failed = await queue.getFailed(0, 49);
    return failed.map(j => ({
      id:          j.id,
      type:        j.name,
      payload:     j.data,
      failedReason: j.failedReason,
      attempts:    j.attemptsMade,
    }));
  }

  async retryFailed(queueName, jobId) {
    const queue = this.#getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`BullMQAdapter: job ${jobId} não encontrado em ${queueName}`);
    await job.retry('failed');
    return { retried: true };
  }

  async close() {
    const closes = [...this.#queues.values()].map(q => q.close());
    await Promise.allSettled(closes);
    this.#queues.clear();
  }

  // ── Helpers ────────────────────────────────────────────────────

  #getQueue(name) {
    if (!this.#queues.has(name)) {
      this.#queues.set(name, new Queue(name, {
        connection:         this.#connection,
        defaultJobOptions:  { removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } },
      }));
    }
    return this.#queues.get(name);
  }
}

module.exports = { BullMQAdapter };
