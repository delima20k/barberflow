'use strict';

const { randomUUID } = require('node:crypto');

class TaskExecution {
  #props;

  constructor(props) {
    this.#props = Object.freeze({
      id: props.id ?? randomUUID(),
      taskName: props.taskName,
      ownerContext: props.ownerContext,
      instanceId: props.instanceId,
      scheduledFor: props.scheduledFor,
      startedAt: props.startedAt,
      finishedAt: props.finishedAt ?? null,
      status: props.status ?? 'running',
      attempts: props.attempts ?? 0,
      error: props.error ?? null,
      durationMs: props.durationMs ?? null,
    });
    Object.freeze(this);
  }

  static start({ task, instanceId, scheduledFor, now }) {
    return new TaskExecution({
      taskName: task.name,
      ownerContext: task.ownerContext,
      instanceId,
      scheduledFor,
      startedAt: now,
      status: 'running',
    });
  }

  finish({ status, attempts, error = null, now }) {
    return new TaskExecution({
      ...this.toJSON(),
      finishedAt: now,
      status,
      attempts,
      error,
      durationMs: now.getTime() - this.startedAt.getTime(),
    });
  }

  get id() { return this.#props.id; }
  get taskName() { return this.#props.taskName; }
  get ownerContext() { return this.#props.ownerContext; }
  get instanceId() { return this.#props.instanceId; }
  get scheduledFor() { return this.#props.scheduledFor; }
  get startedAt() { return this.#props.startedAt; }
  get finishedAt() { return this.#props.finishedAt; }
  get status() { return this.#props.status; }
  get attempts() { return this.#props.attempts; }
  get error() { return this.#props.error; }
  get durationMs() { return this.#props.durationMs; }

  toJSON() {
    return {
      id: this.id,
      taskName: this.taskName,
      ownerContext: this.ownerContext,
      instanceId: this.instanceId,
      scheduledFor: this.scheduledFor,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      status: this.status,
      attempts: this.attempts,
      error: this.error,
      durationMs: this.durationMs,
    };
  }
}

module.exports = { TaskExecution };
