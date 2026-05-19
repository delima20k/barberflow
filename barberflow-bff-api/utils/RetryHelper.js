'use strict';

/**
 * RetryHelper — Retry com backoff exponencial e jitter.
 *
 * Uso:
 *   const dados = await RetryHelper.withRetry(
 *     () => fetchDoBanco(id),
 *     { maxAttempts: 3, baseDelayMs: 200, shouldRetry: (err) => err.status >= 500 }
 *   );
 */
class RetryHelper {

  static #DEFAULT_MAX_ATTEMPTS = 3;
  static #DEFAULT_BASE_DELAY   = 200;  // ms
  static #DEFAULT_MAX_DELAY    = 5000; // ms

  /**
   * Executa `fn` com retry automático em caso de falha.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @param {object}  [opts]
   * @param {number}  [opts.maxAttempts=3]     — tentativas totais (inclui a primeira)
   * @param {number}  [opts.baseDelayMs=200]   — delay base (dobra a cada retry)
   * @param {number}  [opts.maxDelayMs=5000]   — delay máximo
   * @param {boolean} [opts.jitter=true]       — variação aleatória no delay
   * @param {(err: Error, attempt: number) => boolean} [opts.shouldRetry]
   *   — retorna true para tentar novamente; padrão: sempre retry
   * @returns {Promise<T>}
   * @throws {Error} erro da última tentativa
   */
  static async withRetry(fn, opts = {}) {
    const {
      maxAttempts = RetryHelper.#DEFAULT_MAX_ATTEMPTS,
      baseDelayMs = RetryHelper.#DEFAULT_BASE_DELAY,
      maxDelayMs  = RetryHelper.#DEFAULT_MAX_DELAY,
      jitter      = true,
      shouldRetry = () => true,
    } = opts;

    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;

        const isLast = attempt === maxAttempts;
        if (isLast || !shouldRetry(err, attempt)) throw err;

        const delay = RetryHelper.#calcDelay(attempt, baseDelayMs, maxDelayMs, jitter);
        await RetryHelper.#sleep(delay);
      }
    }

    throw lastErr;
  }

  /**
   * Calcula delay com backoff exponencial e jitter opcional.
   * @param {number}  attempt
   * @param {number}  base
   * @param {number}  max
   * @param {boolean} jitter
   * @returns {number} delay em ms
   */
  static #calcDelay(attempt, base, max, jitter) {
    const exponential = Math.min(base * Math.pow(2, attempt - 1), max);
    return jitter
      ? exponential * (0.5 + Math.random() * 0.5) // 50–100% do exponencial
      : exponential;
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  static #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RetryHelper;
