'use strict';

const { TaskExecution } = require('../../domain/scheduler/entities/TaskExecution');

class SchedulerRunner {
  #registry;
  #lock;
  #repository;
  #metrics;
  #instanceId;
  #clock;
  #nextRuns = new Map();
  #delay;

  constructor({
    registry,
    lock,
    repository,
    metrics,
    instanceId,
    clock = { now: () => new Date() },
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  }) {
    if (!registry) throw new TypeError('SchedulerRunner.registry obrigatorio');
    if (!lock) throw new TypeError('SchedulerRunner.lock obrigatorio');
    if (!repository) throw new TypeError('SchedulerRunner.repository obrigatorio');
    if (!metrics) throw new TypeError('SchedulerRunner.metrics obrigatorio');
    this.#registry = registry;
    this.#lock = lock;
    this.#repository = repository;
    this.#metrics = metrics;
    this.#instanceId = instanceId ?? `scheduler-${process.pid}`;
    this.#clock = clock;
    this.#delay = delay;
  }

  async runDue(now = this.#clock.now()) {
    const results = [];
    for (const task of this.#registry.list()) {
      const scheduledFor = this.#scheduledFor(task, now);
      if (now < scheduledFor) continue;
      if (task.isLate(scheduledFor, now)) {
        this.#metrics.record('skippedLate', task.name);
        await this.#repository.recordSkipped({ task, scheduledFor, instanceId: this.#instanceId, reason: 'skew_protection', now });
        this.#nextRuns.set(task.name, task.cron.nextAfter(now));
        continue;
      }
      results.push(await this.#runTask(task, scheduledFor, now));
      this.#nextRuns.set(task.name, task.cron.nextAfter(now));
    }
    return results;
  }

  async trigger(taskName, now = this.#clock.now()) {
    const task = this.#registry.get(taskName);
    if (!task) throw new Error(`SchedulerRunner: task nao registrada ${taskName}`);
    return this.#runTask(task, now, now, { manual: true });
  }

  listTasks(now = this.#clock.now()) {
    return this.#registry.list().map(task => ({
      ...task.toJSON(),
      nextRunAt: this.#scheduledFor(task, now).toISOString(),
    }));
  }

  async #runTask(task, scheduledFor, now, { manual = false } = {}) {
    const lock = await this.#lock.acquire({
      key: `scheduler:${task.name}`,
      ttlMs: task.lockTtlMs,
      owner: this.#instanceId,
    });
    if (!lock?.acquired) {
      this.#metrics.record('lockDenied', task.name);
      return { taskName: task.name, status: 'lock_denied' };
    }
    this.#metrics.record('lockAcquired', task.name);

    let execution = TaskExecution.start({ task, instanceId: this.#instanceId, scheduledFor, now });
    execution = await this.#repository.startExecution(execution, { manual });
    this.#metrics.record('started', task.name);
    const startedAt = this.#clock.now();
    let attempts = 0;
    let status = 'failed';
    let error = null;

    try {
      for (attempts = 1; attempts <= task.retryPolicy.maxAttempts; attempts++) {
        try {
          await this.#executeWithTimeout(task, execution, attempts);
          status = 'success';
          error = null;
          break;
        } catch (err) {
          error = err.message;
          if (/timeout/i.test(error)) status = 'timeout';
          if (attempts < task.retryPolicy.maxAttempts) {
            await this.#delay(task.retryPolicy.delayFor(attempts));
          }
        }
      }
    } finally {
      await this.#lock.release(lock).catch(() => {});
    }

    const finished = execution.finish({ status, attempts, error, now: this.#clock.now() });
    await this.#repository.finishExecution(finished);
    this.#metrics.record(status === 'success' ? 'success' : status === 'timeout' ? 'timeout' : 'failed', task.name, this.#clock.now().getTime() - startedAt.getTime());
    await this.#repository.recordEvent({
      eventName: `SchedulerTask${status === 'success' ? 'Succeeded' : 'Failed'}`,
      taskName: task.name,
      executionId: finished.id,
      status,
      error,
      occurredAt: this.#clock.now().toISOString(),
    });
    return { taskName: task.name, status, attempts, error };
  }

  #scheduledFor(task, now) {
    if (!this.#nextRuns.has(task.name)) {
      this.#nextRuns.set(task.name, task.cron.nextAfter(new Date(now.getTime() - 60_000)));
    }
    return this.#nextRuns.get(task.name);
  }

  #executeWithTimeout(task, execution, attempt) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`timeout apos ${task.timeoutMs}ms`));
      }, task.timeoutMs);
      if (timer.unref) timer.unref();
    });
    const work = task.handler.execute({
      task,
      execution,
      attempt,
      signal: controller.signal,
      instanceId: this.#instanceId,
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }
}

module.exports = { SchedulerRunner };
