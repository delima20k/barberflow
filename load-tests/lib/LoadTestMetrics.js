'use strict';

class LoadTestMetrics {
  #samples = new Map();
  #startedAt = new Date();
  #resourceSamples = [];

  record({ name, method, path, status, durationMs, error = null }) {
    const key = `${method.toUpperCase()} ${path}`;
    if (!this.#samples.has(key)) this.#samples.set(key, []);
    this.#samples.get(key).push({
      name,
      status,
      durationMs,
      error: error ? String(error) : null,
    });
  }

  recordResourceSample() {
    const usage = process.resourceUsage();
    const memory = process.memoryUsage();
    this.#resourceSamples.push({
      at: new Date().toISOString(),
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(2)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
      userCpuMs: Math.round(usage.userCPUTime / 1000),
      systemCpuMs: Math.round(usage.systemCPUTime / 1000),
    });
  }

  summary({ config, endedAt = new Date(), bffMetrics = null } = {}) {
    const endpoints = {};
    let total = 0;
    let errors = 0;

    for (const [key, samples] of this.#samples.entries()) {
      const durations = samples.map(sample => sample.durationMs).sort((a, b) => a - b);
      const endpointErrors = samples.filter(sample => sample.error || sample.status >= 400 || sample.status === 0).length;
      total += samples.length;
      errors += endpointErrors;
      endpoints[key] = {
        requests: samples.length,
        errors: endpointErrors,
        errorRate: LoadTestMetrics.#rate(endpointErrors, samples.length),
        minMs: LoadTestMetrics.#round(durations[0] ?? 0),
        avgMs: LoadTestMetrics.#round(durations.reduce((sum, item) => sum + item, 0) / Math.max(durations.length, 1)),
        p50Ms: LoadTestMetrics.#percentile(durations, 50),
        p95Ms: LoadTestMetrics.#percentile(durations, 95),
        p99Ms: LoadTestMetrics.#percentile(durations, 99),
        maxMs: LoadTestMetrics.#round(durations[durations.length - 1] ?? 0),
        statuses: LoadTestMetrics.#statuses(samples),
      };
    }

    return {
      startedAt: this.#startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      baseUrl: config?.baseUrl,
      scenario: config?.scenario,
      stage: config?.stage,
      vus: config?.vus,
      durationSeconds: config?.durationSeconds,
      testDataPrefix: config?.prefix,
      totalRequests: total,
      totalErrors: errors,
      errorRate: LoadTestMetrics.#rate(errors, total),
      endpoints,
      resources: this.#resourceSamples,
      bffMetrics,
    };
  }

  static #percentile(values, percentile) {
    if (values.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return LoadTestMetrics.#round(values[Math.max(0, Math.min(index, values.length - 1))]);
  }

  static #statuses(samples) {
    return samples.reduce((acc, sample) => {
      const key = String(sample.status);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

  static #rate(count, total) {
    if (!total) return 0;
    return Number((count / total).toFixed(4));
  }

  static #round(value) {
    return Number((Number(value) || 0).toFixed(2));
  }
}

module.exports = LoadTestMetrics;
