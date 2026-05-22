'use strict';

const { randomUUID } = require('node:crypto');
const { DistributedLock } = require('../../domain/scheduler/ports/DistributedLock');

class InMemoryDistributedLock extends DistributedLock {
  #locks = new Map();

  async acquire({ key, ttlMs, owner }) {
    const now = Date.now();
    const current = this.#locks.get(key);
    if (current && current.expiresAt > now) return { acquired: false, key };
    const token = randomUUID();
    this.#locks.set(key, { token, owner, expiresAt: now + ttlMs });
    return { acquired: true, key, token, owner };
  }

  async release(lock) {
    const current = this.#locks.get(lock.key);
    if (current?.token === lock.token) this.#locks.delete(lock.key);
  }
}

module.exports = { InMemoryDistributedLock };
