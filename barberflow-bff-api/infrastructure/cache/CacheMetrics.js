'use strict';

/**
 * CacheMetrics — Coleta métricas de hit/miss/eviction/latência em memória.
 *
 * Thread-safe no sentido do event loop do Node.js (single-thread): não há race
 * nas operações de incremento — incrementos são síncronos.
 *
 * Integre com um sistema de métricas externo (Prometheus, Datadog) chamando
 * `getSnapshot()` periodicamente e enviando os valores.
 */
class CacheMetrics {
  #hits       = 0;
  #misses     = 0;
  #evictions  = 0;
  #latencySum = 0;  // ms acumulados
  #requests   = 0;  // total de operações get cronometradas

  // ── Registro ───────────────────────────────────────────────────

  /**
   * @param {number} latencyMs
   */
  recordHit(latencyMs = 0) {
    this.#hits++;
    this.#requests++;
    this.#latencySum += latencyMs;
  }

  /**
   * @param {number} latencyMs
   */
  recordMiss(latencyMs = 0) {
    this.#misses++;
    this.#requests++;
    this.#latencySum += latencyMs;
  }

  recordEviction() {
    this.#evictions++;
  }

  // ── Leitura ────────────────────────────────────────────────────

  /**
   * @returns {{
   *   hits:         number,
   *   misses:       number,
   *   evictions:    number,
   *   hitRatio:     number,
   *   avgLatencyMs: number,
   * }}
   */
  getSnapshot() {
    const total = this.#hits + this.#misses;
    return {
      hits:         this.#hits,
      misses:       this.#misses,
      evictions:    this.#evictions,
      hitRatio:     total === 0 ? 0 : +(this.#hits / total).toFixed(4),
      avgLatencyMs: this.#requests === 0 ? 0 : +(this.#latencySum / this.#requests).toFixed(2),
    };
  }

  /** Zera todas as métricas (útil para testes ou janelas de tempo). */
  reset() {
    this.#hits       = 0;
    this.#misses     = 0;
    this.#evictions  = 0;
    this.#latencySum = 0;
    this.#requests   = 0;
  }
}

module.exports = { CacheMetrics };
