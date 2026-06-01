'use strict';

const { Result } = require('../../shared/Result');

class ScheduledTask {
  #props;

  constructor(props) {
    this.#props = Object.freeze({ ...props });
    Object.freeze(this);
  }

  static create(props = {}) {
    if (!props.name || typeof props.name !== 'string') return Result.fail('ScheduledTask.name obrigatorio');
    if (!/^[a-z][a-z0-9.-]+$/.test(props.name)) return Result.fail('ScheduledTask.name invalido');
    if (!props.ownerContext) return Result.fail('ScheduledTask.ownerContext obrigatorio');
    if (!props.cron?.nextAfter) return Result.fail('ScheduledTask.cron invalido');
    if (!props.retryPolicy?.maxAttempts) return Result.fail('ScheduledTask.retryPolicy invalida');
    if (!props.handler || typeof props.handler.execute !== 'function') return Result.fail('ScheduledTask.handler invalido');
    if (!Number.isInteger(props.timeoutMs) || props.timeoutMs < 1) return Result.fail('ScheduledTask.timeoutMs deve ser >= 1');
    return Result.ok(new ScheduledTask({
      name: props.name,
      ownerContext: props.ownerContext,
      cron: props.cron,
      timeoutMs: props.timeoutMs,
      retryPolicy: props.retryPolicy,
      handler: props.handler,
      skewProtectionMs: props.skewProtectionMs ?? 60_000,
      skipIfLate: props.skipIfLate ?? true,
      lockTtlMs: props.lockTtlMs ?? Math.max(props.timeoutMs + 5_000, 30_000),
      description: props.description ?? '',
    }));
  }

  get name() { return this.#props.name; }
  get ownerContext() { return this.#props.ownerContext; }
  get cron() { return this.#props.cron; }
  get timeoutMs() { return this.#props.timeoutMs; }
  get retryPolicy() { return this.#props.retryPolicy; }
  get handler() { return this.#props.handler; }
  get skewProtectionMs() { return this.#props.skewProtectionMs; }
  get skipIfLate() { return this.#props.skipIfLate; }
  get lockTtlMs() { return this.#props.lockTtlMs; }
  get description() { return this.#props.description; }

  isLate(scheduledFor, now) {
    return this.skipIfLate && (now.getTime() - scheduledFor.getTime()) > this.skewProtectionMs;
  }

  toJSON() {
    return {
      name: this.name,
      ownerContext: this.ownerContext,
      cron: this.cron.toJSON(),
      timeoutMs: this.timeoutMs,
      retryPolicy: this.retryPolicy.toJSON(),
      skewProtectionMs: this.skewProtectionMs,
      skipIfLate: this.skipIfLate,
      lockTtlMs: this.lockTtlMs,
      description: this.description,
    };
  }
}

module.exports = { ScheduledTask };
