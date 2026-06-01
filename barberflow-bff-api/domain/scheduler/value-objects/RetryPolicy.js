'use strict';

class RetryPolicy {
  #maxAttempts;
  #baseDelayMs;
  #maxDelayMs;

  constructor({ maxAttempts = 3, baseDelayMs = 1_000, maxDelayMs = 30_000 } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError('RetryPolicy.maxAttempts invalido');
    if (baseDelayMs < 0) throw new RangeError('RetryPolicy.baseDelayMs invalido');
    if (maxDelayMs < baseDelayMs) throw new RangeError('RetryPolicy.maxDelayMs invalido');
    this.#maxAttempts = maxAttempts;
    this.#baseDelayMs = baseDelayMs;
    this.#maxDelayMs = maxDelayMs;
    Object.freeze(this);
  }

  get maxAttempts() { return this.#maxAttempts; }

  delayFor(attempt) {
    if (attempt < 1) throw new RangeError('attempt deve ser >= 1');
    return Math.min(this.#baseDelayMs * (2 ** (attempt - 1)), this.#maxDelayMs);
  }

  toJSON() {
    return {
      maxAttempts: this.#maxAttempts,
      baseDelayMs: this.#baseDelayMs,
      maxDelayMs: this.#maxDelayMs,
    };
  }
}

module.exports = { RetryPolicy };
