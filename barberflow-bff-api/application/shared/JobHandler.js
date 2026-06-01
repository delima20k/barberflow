'use strict';

/**
 * JobHandler — Contrato abstrato para handlers de job.
 *
 * Cada handler é responsável por UM tipo de job (SRP).
 * Subclasses devem implementar `jobType` e `handle(job)`.
 *
 * Hooks `onSuccess` e `onFailure` são opcionais — override conforme necessário.
 *
 * @example
 * class MediaProcessingHandler extends JobHandler {
 *   get jobType() { return JOB_TYPES.PROCESS_MEDIA; }
 *   async handle(job) { ... }
 * }
 */
class JobHandler {
  /**
   * Tipo de job que este handler processa.
   * Deve retornar uma constante de JOB_TYPES.
   * @abstract
   * @returns {string}
   */
  get jobType() {
    throw new Error(`${this.constructor.name}.jobType getter não implementado`);
  }

  /**
   * Processa o job.
   * @abstract
   * @param {import('./Job').Job} job
   * @returns {Promise<void>}
   */
  async handle(job) {
    throw new Error(`${this.constructor.name}.handle(job) não implementado`);
  }

  /**
   * Hook chamado após processamento bem-sucedido.
   * Override para side effects pós-sucesso (métricas, logs, notificações).
   * @param {import('./Job').Job} job
   * @returns {Promise<void>}
   */
  async onSuccess(job) {}  // eslint-disable-line no-unused-vars

  /**
   * Hook chamado após falha definitiva (tentativas esgotadas → DLQ).
   * Override para alertas, compensação ou logging crítico.
   * @param {import('./Job').Job} job
   * @param {Error} err
   * @returns {Promise<void>}
   */
  async onFailure(job, err) {}  // eslint-disable-line no-unused-vars
}

module.exports = { JobHandler };
