'use strict';

/**
 * JobScheduler — Agenda jobs periódicos na fila (cron-like).
 *
 * Em produção (BullMQ), os jobs são enfileirados com `repeat: { every }`.
 * O BullMQ garante que apenas UMA instância do job esteja ativa a qualquer momento.
 *
 * Em testes (InMemoryQueueService), os jobs são enfileirados manualmente.
 *
 * @example
 * const scheduler = new JobScheduler({ queueService });
 * scheduler.schedule({
 *   queue: QUEUES.ANALYTICS,
 *   jobType: JOB_TYPES.TRACK_ANALYTICS,
 *   payload: { event: 'daily_summary' },
 *   everyMs: 86_400_000, // 24h
 *   jobId: 'daily-analytics-summary',
 * });
 * await scheduler.start();
 */
class JobScheduler {
  #queueService;
  /** @type {Array<{ queue: string, jobType: string, payload: object, everyMs: number, jobId: string }>} */
  #schedules = [];
  #started = false;

  /**
   * @param {{ queueService: import('../../domain/shared/ports/IQueueService').IQueueService }} deps
   */
  constructor({ queueService }) {
    if (!queueService) throw new TypeError('JobScheduler: queueService é obrigatório');
    this.#queueService = queueService;
  }

  /**
   * Registra um job periódico.
   * @param {object} opts
   * @param {string} opts.queue     — nome da fila
   * @param {string} opts.jobType   — tipo de job
   * @param {object} [opts.payload] — payload estático do job
   * @param {number} opts.everyMs   — intervalo em ms
   * @param {string} opts.jobId     — ID determinístico (evita duplicação)
   * @returns {this}
   */
  schedule({ queue, jobType, payload = {}, everyMs, jobId }) {
    if (!queue)   throw new TypeError('JobScheduler.schedule: queue é obrigatório');
    if (!jobType) throw new TypeError('JobScheduler.schedule: jobType é obrigatório');
    if (!everyMs || everyMs < 1000) throw new RangeError('JobScheduler.schedule: everyMs deve ser >= 1000ms');
    if (!jobId)   throw new TypeError('JobScheduler.schedule: jobId é obrigatório (evita duplicação)');

    this.#schedules.push({ queue, jobType, payload, everyMs, jobId });
    return this;
  }

  /**
   * Enfileira todos os jobs registrados.
   * Em BullMQ: usa opção `repeat.every` para execução periódica.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.#started) return;
    this.#started = true;

    const enqueues = this.#schedules.map(s =>
      this.#queueService.enqueue(s.queue, s.jobType, s.payload, {
        jobId:    s.jobId,
        priority: 10, // baixa prioridade — jobs periódicos não são urgentes
        // BullMQAdapter passa repeat via options se suportado
        repeat: { every: s.everyMs },
      }).catch(() => {}),
    );

    await Promise.allSettled(enqueues);
  }

  /** @returns {ReadonlyArray} cópia dos schedules registrados */
  getSchedules() { return Object.freeze([...this.#schedules]); }

  get isStarted() { return this.#started; }
}

module.exports = { JobScheduler };
