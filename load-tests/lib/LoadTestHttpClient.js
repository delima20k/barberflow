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

  skip(name, reason) {
    this.#metrics.skip(name, reason);
  }

  async request(method, path, body = null, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.#timeoutMs);
    const started = performance.now();
    let status = 0;
    let error = null;
    let ignored = false;
    let responseHeaders = {};
    const timestamp = new Date().toISOString();

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
      responseHeaders = LoadTestHttpClient.#extractHeaders(response.headers);
      ignored = Boolean(options.optional) || LoadTestHttpClient.#isIgnoredStatus(status, options);
      const text = await response.text();
      return { status, body: LoadTestHttpClient.#parseBody(text), ok: response.ok, headers: responseHeaders };
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
        ignored,
        timestamp,
        headers: responseHeaders,
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

  static #isIgnoredStatus(status, options) {
    return Array.isArray(options.ignoreStatuses) && options.ignoreStatuses.includes(status);
  }

  static #extractHeaders(headers) {
    const serverTiming = headers.get('server-timing') ?? null;
    const bffDurationMs = LoadTestHttpClient.#serverTimingDuration(serverTiming, 'bff')
      ?? LoadTestHttpClient.#headerNumber(headers.get('x-bff-duration-ms'));
    const supabaseDurationMs = LoadTestHttpClient.#serverTimingDuration(serverTiming, 'supabase')
      ?? LoadTestHttpClient.#headerNumber(headers.get('x-supabase-duration-ms'));
    return {
      xVercelId: headers.get('x-vercel-id') ?? null,
      serverTiming,
      bffDurationMs,
      supabaseDurationMs,
      xResponseTime: headers.get('x-response-time') ?? null,
    };
  }

  static #headerNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  static #serverTimingDuration(value, metricName) {
    if (!value) return null;
    const metric = String(metricName).toLowerCase();
    const item = String(value)
      .split(',')
      .map(part => part.trim())
      .find(part => part.toLowerCase().startsWith(`${metric};`));
    const match = item?.match(/(?:^|;)\s*dur=([0-9.]+)/i);
    return match ? Number(match[1]) : null;
  }
}

module.exports = LoadTestHttpClient;
