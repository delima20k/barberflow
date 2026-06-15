'use strict';

class LoadTestMetrics {
  #samples = new Map();
  #startedAt = new Date();
  #resourceSamples = [];
  #skipped = {};
  #requestDetails = [];

  record({ name, method, path, status, durationMs, error = null, ignored = false, timestamp = new Date().toISOString(), headers = {} }) {
    const key = `${method.toUpperCase()} ${path}`;
    const roundedDuration = LoadTestMetrics.#round(durationMs);
    if (!this.#samples.has(key)) this.#samples.set(key, []);
    this.#samples.get(key).push({
      name,
      status,
      durationMs: roundedDuration,
      error: error ? String(error) : null,
      ignored: Boolean(ignored),
    });
    this.#requestDetails.push({
      timestamp,
      endpoint: key,
      name,
      method: method.toUpperCase(),
      path,
      status,
      durationMs: roundedDuration,
      error: error ? String(error) : null,
      ignored: Boolean(ignored),
      headers: {
        xVercelId: headers?.xVercelId ?? null,
        serverTiming: headers?.serverTiming ?? null,
        bffDurationMs: headers?.bffDurationMs ?? null,
        supabaseDurationMs: headers?.supabaseDurationMs ?? null,
        xResponseTime: headers?.xResponseTime ?? null,
      },
    });
  }

  skip(name, reason) {
    this.#skipped[name] = reason;
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
    let recordedTotal = 0;
    let optionalTotal = 0;

    for (const [key, samples] of this.#samples.entries()) {
      const durations = samples.map(sample => sample.durationMs).sort((a, b) => a - b);
      const endpointErrors = samples.filter(sample => !sample.ignored && (sample.error || sample.status >= 400 || sample.status === 0)).length;
      const primarySamples = samples.filter(sample => !sample.ignored).length;
      recordedTotal += samples.length;
      optionalTotal += samples.length - primarySamples;
      total += primarySamples;
      errors += endpointErrors;
      endpoints[key] = {
        requests: samples.length,
        primaryRequests: primarySamples,
        optionalRequests: samples.length - primarySamples,
        errors: endpointErrors,
        errorRate: LoadTestMetrics.#rate(endpointErrors, primarySamples),
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
      totalRecordedRequests: recordedTotal,
      optionalRequests: optionalTotal,
      totalErrors: errors,
      errorRate: LoadTestMetrics.#rate(errors, total),
      endpoints,
      requestDetails: this.#requestDetails,
      slowRequests: this.#slowRequests(),
      skipped: { ...this.#skipped },
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

  #slowRequests() {
    return [...this.#requestDetails]
      .filter(sample => !sample.ignored)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 25);
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
