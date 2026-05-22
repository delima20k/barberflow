'use strict';

class SchedulerService {
  #runner;
  #intervalMs;
  #timer = null;

  constructor({ runner, intervalMs = 30_000 }) {
    if (!runner) throw new TypeError('SchedulerService.runner obrigatorio');
    if (intervalMs < 1_000) throw new RangeError('SchedulerService.intervalMs deve ser >= 1000');
    this.#runner = runner;
    this.#intervalMs = intervalMs;
  }

  start() {
    if (this.#timer) return;
    this.#runner.runDue().catch(() => {});
    this.#timer = setInterval(() => this.#runner.runDue().catch(() => {}), this.#intervalMs);
    if (this.#timer.unref) this.#timer.unref();
  }

  stop() {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  trigger(taskName) {
    return this.#runner.trigger(taskName);
  }

  listTasks() {
    return this.#runner.listTasks();
  }
}

module.exports = { SchedulerService };
