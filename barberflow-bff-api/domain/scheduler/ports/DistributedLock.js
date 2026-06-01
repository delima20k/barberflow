'use strict';

class DistributedLock {
  async acquire({ key, ttlMs, owner }) {
    void key;
    void ttlMs;
    void owner;
    throw new Error(`${this.constructor.name}.acquire nao implementado`);
  }

  async release(lock) {
    void lock;
    throw new Error(`${this.constructor.name}.release nao implementado`);
  }
}

module.exports = { DistributedLock };
