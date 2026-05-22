'use strict';

class SchedulerMetrics {
  #counters = {
    started: 0,
    success: 0,
    failed: 0,
    timeout: 0,
    skippedLate: 0,
    lockAcquired: 0,
    lockDenied: 0,
  };
  #durationByTask = new Map();

  record(event, taskName, durationMs = null) {
    if (Object.hasOwn(this.#counters, event)) this.#counters[event]++;
    if (durationMs !== null && taskName) {
      if (!this.#durationByTask.has(taskName)) this.#durationByTask.set(taskName, []);
      this.#durationByTask.get(taskName).push(durationMs);
    }
  }

  snapshot() {
    const durations = {};
    for (const [taskName, values] of this.#durationByTask.entries()) {
      const sum = values.reduce((acc, value) => acc + value, 0);
      durations[taskName] = { count: values.length, avgMs: values.length ? Math.round(sum / values.length) : 0 };
    }
    return { ...this.#counters, durations };
  }
}

module.exports = { SchedulerMetrics };
