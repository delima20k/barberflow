'use strict';

class DeliveryChannel {
  get name() {
    throw new Error(`${this.constructor.name}.name nao implementado`);
  }

  async send({ notification, rendered }) {
    void notification;
    void rendered;
    throw new Error(`${this.constructor.name}.send nao implementado`);
  }
}

module.exports = { DeliveryChannel };
