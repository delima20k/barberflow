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

class CountingTask {
  constructor(counter) { this.counter = counter; }
  async execute() { this.counter.count++; }
}

function makeTask(counter) {
  return ScheduledTask.create({
    name: 'outbox.relay',
    ownerContext: 'messaging',
    cron: CronExpression.create('* * * * *', { timezone: 'UTC' }).getValue(),
    timeoutMs: 1_000,
    retryPolicy: new RetryPolicy({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }),
    handler: new CountingTask(counter),
    skewProtectionMs: 60_000,
  }).getValue();
}

describe('SchedulerRunner distributed lock', () => {
  it('deve permitir execucao unica quando duas instancias competem pelo mesmo lock', async () => {
    const counter = { count: 0 };
    const lock = new InMemoryDistributedLock();
    const repository = new InMemorySchedulerRepository();
    const metrics = new SchedulerMetrics();
    const registry = new TaskRegistry().register(makeTask(counter));
    const now = new Date('2026-05-22T12:00:00.000Z');
    const runnerA = new SchedulerRunner({ registry, lock, repository, metrics, instanceId: 'a' });
    const runnerB = new SchedulerRunner({ registry, lock, repository, metrics, instanceId: 'b' });

    await Promise.all([runnerA.runDue(now), runnerB.runDue(now)]);

    assert.deepEqual({
      executions: counter.count,
      persisted: repository.executions.length,
      acquired: metrics.snapshot().lockAcquired,
    }, {
      executions: 1,
      persisted: 1,
      acquired: 1,
    });
  });
});
