'use strict';

const { randomUUID } = require('node:crypto');
const { DistributedLock } = require('../../domain/scheduler/ports/DistributedLock');

class RedisDistributedLock extends DistributedLock {
  #redis;
  #prefix;

  constructor({ redisClient, prefix = 'bf:scheduler:lock' }) {
    super();
    if (!redisClient) throw new TypeError('RedisDistributedLock.redisClient obrigatorio');
    this.#redis = redisClient;
    this.#prefix = prefix;
  }

  async acquire({ key, ttlMs, owner }) {
    const token = randomUUID();
    const redisKey = `${this.#prefix}:${key}`;
    const result = await this.#redis.set(redisKey, JSON.stringify({ token, owner }), 'PX', ttlMs, 'NX');
    return result === 'OK'
      ? { acquired: true, key: redisKey, token, owner }
      : { acquired: false, key: redisKey };
  }

  async release(lock) {
    if (!lock?.acquired) return;
    const script = `
      local current = redis.call("GET", KEYS[1])
      if current and string.find(current, ARGV[1], 1, true) then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;
    await this.#redis.eval(script, 1, lock.key, lock.token);
  }
}

module.exports = { RedisDistributedLock };
