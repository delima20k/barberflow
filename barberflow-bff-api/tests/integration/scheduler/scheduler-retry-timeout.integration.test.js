'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SchedulerRunner } = require('../../../application/scheduler/SchedulerRunner');
const { TaskRegistry } = require('../../../application/scheduler/TaskRegistry');
const { ScheduledTask } = require('../../../domain/scheduler/entities/ScheduledTask');
const { CronExpression } = require('../../../domain/scheduler/value-objects/CronExpression');
const { RetryPolicy } = require('../../../domain/scheduler/value-objects/RetryPolicy');
const { InMemoryDistributedLock } = require('../../../infrastructure/scheduler/InMemoryDistributedLock');
const { InMemorySchedulerRepository } = require('../../../infrastructure/scheduler/InMemorySchedulerRepository');
const { SchedulerMetrics } = require('../../../application/scheduler/SchedulerMetrics');

class FlakyTask {
  constructor() { this.calls = 0; }
  async execute() {
    this.calls++;
    if (this.calls === 1) throw new Error('falha temporaria');
  }
}

class HangingTask {
  async execute({ signal }) {
    await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true });
    });
  }
}

function scheduled({ name, handler, timeoutMs = 1_000, maxAttempts = 2 }) {
  return ScheduledTask.create({
    name,
    ownerContext: 'tests',
    cron: CronExpression.create('* * * * *', { timezone: 'UTC' }).getValue(),
    timeoutMs,
    retryPolicy: new RetryPolicy({ maxAttempts, baseDelayMs: 0, maxDelayMs: 0 }),
    handler,
    skewProtectionMs: 60_000,
  }).getValue();
}

describe('SchedulerRunner timeout e retry', () => {
  it('deve retentar ate sucesso e persistir historico', async () => {
    const task = new FlakyTask();
    const repository = new InMemorySchedulerRepository();
    const runner = new SchedulerRunner({
      registry: new TaskRegistry().register(scheduled({ name: 'flaky.task', handler: task })),
      lock: new InMemoryDistributedLock(),
      repository,
      metrics: new SchedulerMetrics(),
      instanceId: 'worker-1',
    });

    await runner.runDue(new Date('2026-05-22T12:00:00.000Z'));

    assert.deepEqual({ calls: task.calls, status: repository.executions[0].status }, { calls: 2, status: 'success' });
  });

  it('deve falhar por timeout e registrar erro', async () => {
    const repository = new InMemorySchedulerRepository();
    const runner = new SchedulerRunner({
      registry: new TaskRegistry().register(scheduled({ name: 'timeout.task', handler: new HangingTask(), timeoutMs: 10, maxAttempts: 1 })),
      lock: new InMemoryDistributedLock(),
      repository,
      metrics: new SchedulerMetrics(),
      instanceId: 'worker-1',
    });

    await runner.runDue(new Date('2026-05-22T12:00:00.000Z'));

    assert.match(repository.executions[0].error, /timeout/i);
  });
});
