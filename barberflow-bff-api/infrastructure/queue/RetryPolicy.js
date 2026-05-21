'use strict';

/**
 * RetryPolicy — Configura backoff exponencial com jitter para reprocessamento.
 *
 * Fórmula do delay:
 *   delay = min(baseDelayMs * 2^(attempt-1), maxDelayMs)
 *   jitter = delay * random(0.5, 1.0)   (quando jitter=true)
 *
 * Factories prontas:
 *   RetryPolicy.defaultPolicy()   — 3 tentativas, base 1s, max 30s
 *   RetryPolicy.criticalPolicy()  — 5 tentativas, base 2s, max 60s
 *   RetryPolicy.analyticsPolicy() — 2 tentativas, base 500ms, max 5s
 */
class RetryPolicy {
  #maxAttempts;
  #baseDelayMs;
  #maxDelayMs;
  #jitter;

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxAttempts=3]
   * @param {number} [opts.baseDelayMs=1000]
   * @param {number} [opts.maxDelayMs=30000]
   * @param {boolean} [opts.jitter=true]
   */
  constructor({ maxAttempts = 3, baseDelayMs = 1_000, maxDelayMs = 30_000, jitter = true } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
      throw new RangeError('RetryPolicy: maxAttempts deve ser inteiro >= 1');
    if (baseDelayMs < 0) throw new RangeError('RetryPolicy: baseDelayMs deve ser >= 0');
    if (maxDelayMs < baseDelayMs) throw new RangeError('RetryPolicy: maxDelayMs deve ser >= baseDelayMs');

    this.#maxAttempts = maxAttempts;
    this.#baseDelayMs = baseDelayMs;
    this.#maxDelayMs  = maxDelayMs;
    this.#jitter      = jitter;
  }

  /** @returns {number} */
  get maxAttempts() { return this.#maxAttempts; }

  /**
   * Calcula o delay em ms para uma tentativa específica.
   * @param {number} attempt — 1-indexed (1 = primeira tentativa)
   * @returns {number} delay em ms
   */
  delayFor(attempt) {
    if (attempt < 1) throw new RangeError('attempt deve ser >= 1');
    const exp = Math.min(this.#baseDelayMs * (2 ** (attempt - 1)), this.#maxDelayMs);
    if (!this.#jitter) return exp;
    return Math.floor(exp * (0.5 + Math.random() * 0.5));
  }

  /**
   * Retorna a configuração no formato esperado pelo BullMQ.
   * @returns {{ attempts: number, backoff: { type: string, delay: number } }}
   */
  toBullMQOptions() {
    const self = this;
    return {
      attempts: this.#maxAttempts,
      backoff: {
        type: 'exponential',
        delay: self.#baseDelayMs,
      },
      removeOnFail: { count: 500 },
    };
  }

  /** Converte para objeto simples (útil para logging). */
  toJSON() {
    return {
      maxAttempts: this.#maxAttempts,
      baseDelayMs: this.#baseDelayMs,
      maxDelayMs:  this.#maxDelayMs,
      jitter:      this.#jitter,
    };
  }

  // ── Factories ──────────────────────────────────────────────────

  static defaultPolicy()   { return new RetryPolicy({}); }
  static criticalPolicy()  { return new RetryPolicy({ maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 60_000 }); }
  static analyticsPolicy() { return new RetryPolicy({ maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 5_000 }); }
  static webhookPolicy()   { return new RetryPolicy({ maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 300_000 }); }
}

module.exports = { RetryPolicy };
