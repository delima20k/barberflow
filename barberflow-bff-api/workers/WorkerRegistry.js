'use strict';

const { Worker } = require('bullmq');

/**
 * WorkerRegistry — Registra handlers e cria Workers BullMQ por fila.
 *
 * Responsável por:
 *   1. Mapear jobType → JobHandler
 *   2. Criar um BullMQ Worker por fila com o processador correto
 *   3. Instrumentar eventos: completed, failed, stalled, error
 *   4. Fechar workers graciosamente no shutdown
 *
 * Uso:
 *   const registry = new WorkerRegistry({ connection, concurrency: 5 });
 *   registry.register(mediaHandler)
 *           .register(notificationHandler);
 *   registry.start([QUEUES.MEDIA, QUEUES.NOTIFICATIONS]);
 */
class WorkerRegistry {
  #connection;
  #concurrency;
  /** @type {Map<string, import('../application/shared/JobHandler').JobHandler>} */
  #handlers = new Map();
  /** @type {Map<string, Worker>} queueName → Worker */
  #workers = new Map();

  /**
   * @param {{ connection: object, concurrency?: number }} opts
   */
  constructor({ connection, concurrency = 5 }) {
    if (!connection) throw new TypeError('WorkerRegistry: connection é obrigatório');
    this.#connection  = connection;
    this.#concurrency = concurrency;
  }

  /**
   * Registra um handler para um tipo de job.
   * @param {import('../application/shared/JobHandler').JobHandler} handler
   * @returns {this}
   */
  register(handler) {
    if (!handler || typeof handler.jobType !== 'string')
      throw new TypeError('WorkerRegistry.register: handler.jobType deve ser string');
    this.#handlers.set(handler.jobType, handler);
    return this;
  }

  /**
   * Cria e inicia um Worker BullMQ para cada fila.
   * @param {string[]} queues — lista de nomes de fila (usar QUEUES)
   */
  start(queues) {
    for (const queueName of queues) {
      if (this.#workers.has(queueName)) continue;

      const worker = new Worker(
        queueName,
        async (bullJob) => {
          const handler = this.#handlers.get(bullJob.name);
          if (!handler) {
            throw new Error(`WorkerRegistry: nenhum handler para job type "${bullJob.name}" na fila "${queueName}"`);
          }

          // Constrói objeto Job compatível com a interface dos handlers
          const job = {
            id:          bullJob.id,
            type:        bullJob.name,
            queue:       queueName,
            payload:     bullJob.data ?? {},
            attempts:    bullJob.attemptsMade,
            maxAttempts: bullJob.opts.attempts ?? 3,
          };

          await handler.handle(job);
        },
        {
          connection:  this.#connection,
          concurrency: this.#concurrency,
        },
      );

      worker.on('completed', (job) => {
        // eslint-disable-next-line no-console
        console.info(`[Worker:${queueName}] job ${job.id} (${job.name}) concluído`);
      });

      worker.on('failed', async (job, err) => {
        const exhausted = job && job.attemptsMade >= (job.opts.attempts ?? 3);
        // eslint-disable-next-line no-console
        console.error(`[Worker:${queueName}] job ${job?.id} (${job?.name}) falhou: ${err.message}${exhausted ? ' [EXAUSTED→DLQ]' : ''}`);

        if (exhausted) {
          const handler = this.#handlers.get(job?.name);
          if (handler) await handler.onFailure(job, err).catch(() => {});
        }
      });

      worker.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error(`[Worker:${queueName}] erro interno: ${err.message}`);
      });

      this.#workers.set(queueName, worker);
    }
  }

  /**
   * Fecha todos os workers graciosamente (espera jobs em andamento).
   */
  async stop() {
    const closes = [...this.#workers.values()].map(w => w.close());
    await Promise.allSettled(closes);
    this.#workers.clear();
  }

  /** @returns {string[]} filas com workers ativos */
  get activeQueues() { return [...this.#workers.keys()]; }

  /** @returns {string[]} job types registrados */
  get registeredTypes() { return [...this.#handlers.keys()]; }
}

module.exports = { WorkerRegistry };
