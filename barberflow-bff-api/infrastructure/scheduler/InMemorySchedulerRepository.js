'use strict';

class InMemorySchedulerRepository {
  constructor() {
    this.executions = [];
    this.events = [];
    this.skipped = [];
  }

  async startExecution(execution) {
    this.executions.push(execution.toJSON());
    return execution;
  }

  async finishExecution(execution) {
    const idx = this.executions.findIndex(row => row.id === execution.id);
    if (idx >= 0) this.executions[idx] = execution.toJSON();
    else this.executions.push(execution.toJSON());
  }

  async recordSkipped(row) {
    this.skipped.push(row);
  }

  async recordEvent(event) {
    this.events.push(event);
  }
}

module.exports = { InMemorySchedulerRepository };
