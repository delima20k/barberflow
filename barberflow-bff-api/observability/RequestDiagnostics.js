'use strict';

/**
 * RequestDiagnostics - coleta tempos por etapa de uma requisicao.
 *
 * Nao registra payload, token ou conteudo sensivel. O uso principal e expor
 * timings compactos em headers e logs para diagnostico de performance.
 */
class RequestDiagnostics {
  static #MAX_HEADER_STEPS = 16;

  #name;
  #startedAt;
  #steps = new Map();
  #notes = new Map();

  constructor(name) {
    this.#name = name;
    this.#startedAt = process.hrtime.bigint();
  }

  get name() {
    return this.#name;
  }

  async time(step, action) {
    const startedAt = process.hrtime.bigint();
    try {
      return await action();
    } finally {
      this.record(step, RequestDiagnostics.#elapsedMs(startedAt));
    }
  }

  record(step, durationMs) {
    if (!Number.isFinite(durationMs)) return;
    this.#steps.set(step, Number(durationMs.toFixed(2)));
  }

  timing(step) {
    return this.#steps.get(step);
  }

  mark(step, value) {
    if (value === undefined || value === null) return;
    this.#steps.set(step, RequestDiagnostics.#safeValue(value));
  }

  note(key, value) {
    if (value === undefined || value === null) return;
    this.#notes.set(key, String(value));
  }

  finish() {
    if (!this.#steps.has('total')) {
      this.record('total', RequestDiagnostics.#elapsedMs(this.#startedAt));
    }
  }

  toObject() {
    this.finish();
    return {
      name: this.#name,
      timingsMs: Object.fromEntries(this.#steps),
      notes: Object.fromEntries(this.#notes),
    };
  }

  toHeaderValue() {
    this.finish();
    return Array.from(this.#steps.entries())
      .slice(0, RequestDiagnostics.#MAX_HEADER_STEPS)
      .map(([key, value]) => `${RequestDiagnostics.#safeToken(key)}=${value}`)
      .join(';');
  }

  toServerTiming() {
    this.finish();
    return Array.from(this.#steps.entries())
      .filter(([, value]) => Number.isFinite(value))
      .slice(0, RequestDiagnostics.#MAX_HEADER_STEPS)
      .map(([key, value]) => `${RequestDiagnostics.#safeToken(key)};dur=${value}`)
      .join(', ');
  }

  static current(req) {
    return req?.barberflowDiagnostics ?? null;
  }

  static #elapsedMs(startedAt) {
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  }

  static #safeToken(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }

  static #safeValue(value) {
    return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
  }
}

module.exports = RequestDiagnostics;
