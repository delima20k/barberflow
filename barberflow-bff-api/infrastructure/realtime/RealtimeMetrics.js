'use strict';

/**
 * RealtimeMetrics — Contadores e histogramas do gateway WebSocket.
 *
 * Opera em memória por processo. Expõe snapshot() para /api/v1/health e logs.
 *
 * Métricas coletadas:
 *   - connections_active  — conexões abertas no momento
 *   - total_messages      — total de mensagens publicadas desde o boot
 *   - msgs_per_sec        — mensagens nos últimos 1000 ms (sliding window)
 *   - fanout_latency_ms   — percentis p50/p99 das últimas 1000 latências
 *   - errors_by_channel   — contagem de erros por canal
 */
class RealtimeMetrics {
  /** @type {number} */
  #activeConnections = 0;

  /** @type {number} */
  #totalMessages = 0;

  /** @type {number[]} timestamps em ms dos últimos msgs (sliding window 1s) */
  #msgTimestamps = [];

  /** @type {number[]} latências de fanout em ms (últimas 1000) */
  #latencies = [];

  /** @type {Map<string, number>} */
  #errorsByChannel = new Map();

  // ── Mutators ───────────────────────────────────────────────────

  incrementConnections() {
    this.#activeConnections++;
  }

  decrementConnections() {
    if (this.#activeConnections > 0) this.#activeConnections--;
  }

  /**
   * Registra uma mensagem publicada.
   * Mantém sliding window de 1 segundo (remove timestamps expirados).
   */
  recordMessage() {
    this.#totalMessages++;
    const now = Date.now();
    this.#msgTimestamps.push(now);
    this.#pruneMsgTimestamps(now);
  }

  /**
   * Registra a latência de um fan-out em ms.
   * Mantém histograma das últimas 1000 amostras.
   * @param {number} ms
   */
  recordFanoutLatency(ms) {
    this.#latencies.push(ms);
    if (this.#latencies.length > 1000) this.#latencies.shift();
  }

  /**
   * Incrementa o contador de erros para o canal.
   * @param {string} channel
   */
  recordError(channel) {
    this.#errorsByChannel.set(channel, (this.#errorsByChannel.get(channel) ?? 0) + 1);
  }

  // ── Snapshot ───────────────────────────────────────────────────

  /**
   * Retorna snapshot das métricas para o health endpoint.
   * @returns {object}
   */
  snapshot() {
    const now = Date.now();
    this.#pruneMsgTimestamps(now);

    const msgsPerSec = this.#msgTimestamps.length;

    const sorted = [...this.#latencies].sort((a, b) => a - b);
    const p50    = sorted[Math.floor(sorted.length * 0.5)]  ?? 0;
    const p99    = sorted[Math.floor(sorted.length * 0.99)] ?? 0;

    return {
      activeConnections: this.#activeConnections,
      totalMessages:     this.#totalMessages,
      msgsPerSec,
      fanoutLatency:     { p50, p99 },
      errorsByChannel:   Object.fromEntries(this.#errorsByChannel),
    };
  }

  // ── Private ────────────────────────────────────────────────────

  /**
   * Remove timestamps mais antigos que 1 segundo.
   * @param {number} now
   */
  #pruneMsgTimestamps(now) {
    const threshold = now - 1000;
    let i = 0;
    while (i < this.#msgTimestamps.length && this.#msgTimestamps[i] < threshold) {
      i++;
    }
    if (i > 0) this.#msgTimestamps.splice(0, i);
  }
}

module.exports = { RealtimeMetrics };
