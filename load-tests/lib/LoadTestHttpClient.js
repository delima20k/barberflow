'use strict';

const { performance } = require('node:perf_hooks');

class LoadTestHttpClient {
  #baseUrl;
  #metrics;
  #timeoutMs;

  constructor({ baseUrl, metrics, timeoutMs = 8000 }) {
    this.#baseUrl = baseUrl;
    this.#metrics = metrics;
    this.#timeoutMs = timeoutMs;
  }

  async get(path, options = {}) {
    return this.request('GET', path, null, options);
  }

  async post(path, body = {}, options = {}) {
    return this.request('POST', path, body, options);
  }

  async patch(path, body = {}, options = {}) {
    return this.request('PATCH', path, body, options);
  }

  async request(method, path, body = null, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.#timeoutMs);
    const started = performance.now();
    let status = 0;
    let error = null;

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-Load-Test': 'barberflow',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      };
      const response = await fetch(`${this.#baseUrl}${path}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      status = response.status;
      const text = await response.text();
      return { status, body: LoadTestHttpClient.#parseBody(text), ok: response.ok };
    } catch (err) {
      error = err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'request failed');
      return { status, body: null, ok: false, error };
    } finally {
      clearTimeout(timeout);
      this.#metrics.record({
        name: options.name ?? path,
        method,
        path: LoadTestHttpClient.#normalizePath(path),
        status,
        durationMs: performance.now() - started,
        error,
      });
    }
  }

  async metricsText() {
    const result = await this.get('/metrics', { name: 'metrics' });
    return typeof result.body === 'string' ? result.body : null;
  }

  static #parseBody(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  static #normalizePath(path) {
    return path.split('?')[0];
  }
}

module.exports = LoadTestHttpClient;
