'use strict';

class OutboxRelayTask {
  #outboxRelay;

  constructor({ outboxRelay }) {
    if (!outboxRelay) throw new TypeError('OutboxRelayTask.outboxRelay obrigatorio');
    this.#outboxRelay = outboxRelay;
  }

  async execute() {
    await this.#outboxRelay.runOnce();
  }
}

module.exports = { OutboxRelayTask };
