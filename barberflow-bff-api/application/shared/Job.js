'use strict';

const { randomUUID }      = require('node:crypto');
const { BaseValueObject } = require('../../domain/shared/BaseValueObject');
const { Result }          = require('../../domain/shared/Result');

/**
 * Job — Value Object imutável representando uma unidade de trabalho em fila.
 *
 * Campos:
 *   id          — UUID único do job (gerado automaticamente se omitido)
 *   type        — tipo do job (usar JOB_TYPES de config/queues.js)
 *   queue       — nome da fila de destino (usar QUEUES de config/queues.js)
 *   payload     — dados do job (POJO serializável em JSON)
 *   priority    — 1=alto, 10=baixo (default 5)
 *   attempts    — tentativas realizadas até agora (default 0)
 *   maxAttempts — máximo de tentativas antes de ir para DLQ (default 3)
 *   createdAt   — ISO 8601 string
 *   processedAt — ISO 8601 string | null
 *   failedReason — string | null
 *
 * Mutações retornam NOVOS Jobs (imutabilidade preservada).
 */
class Job extends BaseValueObject {
  constructor(props) {
    super(props);
  }

  _validate() {
    const p = this._props;
    if (!p.id)   return Result.fail('Job.id é obrigatório');
    if (!p.type) return Result.fail('Job.type é obrigatório');
    if (!p.queue) return Result.fail('Job.queue é obrigatório');
    if (typeof p.priority !== 'number' || p.priority < 1)
      return Result.fail('Job.priority deve ser número >= 1');
    if (typeof p.maxAttempts !== 'number' || p.maxAttempts < 1)
      return Result.fail('Job.maxAttempts deve ser número >= 1');
    return Result.ok(this);
  }

  /**
   * Factory principal — valida props e retorna Result<Job, string>.
   * @param {object} props
   * @returns {Result<Job, string>}
   */
  static create(props) {
    const job = new Job({
      id:          props.id          ?? randomUUID(),
      type:        props.type,
      queue:       props.queue,
      payload:     props.payload     ?? {},
      priority:    props.priority    ?? 5,
      attempts:    props.attempts    ?? 0,
      maxAttempts: props.maxAttempts ?? 3,
      createdAt:   props.createdAt   ?? new Date().toISOString(),
      processedAt: props.processedAt  ?? null,
      failedReason: props.failedReason ?? null,
    });
    return job._validate();
  }

  // ── Getters ────────────────────────────────────────────────────

  get id()           { return this._props.id; }
  get type()         { return this._props.type; }
  get queue()        { return this._props.queue; }
  get payload()      { return { ...this._props.payload }; }
  get priority()     { return this._props.priority; }
  get attempts()     { return this._props.attempts; }
  get maxAttempts()  { return this._props.maxAttempts; }
  get createdAt()    { return this._props.createdAt; }
  get processedAt()  { return this._props.processedAt; }
  get failedReason() { return this._props.failedReason; }

  /** @returns {boolean} true quando tentativas esgotadas → vai para DLQ */
  get isExhausted() { return this._props.attempts >= this._props.maxAttempts; }

  // ── Mutações imutáveis (retornam novo Job sem Result) ──────────

  withAttempt() {
    return Job.#fromRaw({ ...this._props, attempts: this._props.attempts + 1 });
  }

  complete() {
    return Job.#fromRaw({ ...this._props, processedAt: new Date().toISOString() });
  }

  /**
   * @param {string} reason — mensagem de erro
   * @returns {Job}
   */
  fail(reason) {
    return Job.#fromRaw({
      ...this._props,
      attempts:    this._props.attempts + 1,
      failedReason: String(reason),
    });
  }

  /** Constrói diretamente sem validar (uso interno em mutações seguras). */
  static #fromRaw(props) {
    return new Job(props);
  }
}

module.exports = { Job };
