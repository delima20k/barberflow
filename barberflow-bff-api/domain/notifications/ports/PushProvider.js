'use strict';

class PushProvider {
  get name() {
    throw new Error(`${this.constructor.name}.name nao implementado`);
  }

  async send({ userId, title, body, data, priority }) {
    void userId;
    void title;
    void body;
    void data;
    void priority;
    throw new Error(`${this.constructor.name}.send nao implementado`);
  }
}

module.exports = { PushProvider };
