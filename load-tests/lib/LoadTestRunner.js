'use strict';

const fs = require('node:fs');
const path = require('node:path');
const LoadTestConfig = require('./LoadTestConfig');
const LoadTestMetrics = require('./LoadTestMetrics');
const LoadTestHttpClient = require('./LoadTestHttpClient');
const BarberFlowScenario = require('./BarberFlowScenario');

class LoadTestRunner {
  static METRICS_TIMEOUT_MS = 3000;

  #config;
  #metrics;
  #client;
  #scenario;
  #writeSummaryEnabled;

  constructor({
    config = new LoadTestConfig(),
    metrics = new LoadTestMetrics(),
    createClient = null,
    writeSummary = true,
  } = {}) {
    this.#config = config;
    this.#metrics = metrics;
    this.#client = createClient ? createClient({ config, metrics }) : new LoadTestHttpClient({
      baseUrl: config.baseUrl,
      metrics,
      timeoutMs: config.timeoutMs,
    });
    this.#scenario = new BarberFlowScenario({ client: this.#client, config });
    this.#writeSummaryEnabled = writeSummary;
  }

  async run() {
    const endAt = Date.now() + (this.#config.durationSeconds * 1000);
    const workers = [];
    const resourceTimer = setInterval(() => this.#metrics.recordResourceSample(), 1000);
    const bffMetricsBeforePromise = this.#collectBffMetrics('before');

    for (let vu = 1; vu <= this.#config.vus; vu += 1) {
      workers.push(this.#runVu(vu, endAt));
    }

    await Promise.all(workers);
    clearInterval(resourceTimer);
    this.#metrics.recordResourceSample();

    const bffMetricsBefore = await bffMetricsBeforePromise;
    const bffMetricsAfter = await this.#collectBffMetrics('after');
    const bffMetrics = { before: bffMetricsBefore, after: bffMetricsAfter };
    const summary = this.#metrics.summary({ config: this.#config, bffMetrics });
    summary.metricsBefore = bffMetricsBefore;
    summary.metricsAfter = bffMetricsAfter;
    summary.metricsWarnings = [bffMetricsBefore, bffMetricsAfter]
      .filter(item => !item.available)
      .map(item => ({
        label: item.label,
        metricsError: item.metricsError,
        status: item.status,
      }));
    const outputPath = this.#writeSummaryEnabled ? this.#writeSummary(summary) : null;
    return { summary, outputPath };
  }

  async #runVu(vu, endAt) {
    let iteration = 0;
    while (Date.now() < endAt) {
      iteration += 1;
      await this.#scenario.runOnce(vu, iteration);
      await LoadTestRunner.#sleep(this.#config.thinkTimeMs);
    }
  }

  async #collectBffMetrics(label) {
    const result = await this.#client.get('/metrics', {
      name: `metrics_${label}`,
      optional: true,
      timeoutMs: LoadTestRunner.METRICS_TIMEOUT_MS,
      ignoreStatuses: [401, 403, 404],
    });
    if (!result.ok || typeof result.body !== 'string') {
      return {
        label,
        available: false,
        status: result.status,
        timeoutMs: LoadTestRunner.METRICS_TIMEOUT_MS,
        metricsError: result.status ? `HTTP ${result.status}` : (result.error ?? 'indisponivel'),
      };
    }
    return {
      label,
      available: true,
      status: result.status,
      timeoutMs: LoadTestRunner.METRICS_TIMEOUT_MS,
      bytes: Buffer.byteLength(result.body),
      parsed: LoadTestRunner.#parseBffMetrics(result.body),
      interestingLines: result.body
        .split('\n')
        .filter(line => /^bff_|^nodejs_|^process_/.test(line))
        .slice(0, 40),
    };
  }

  static #parseBffMetrics(text) {
    const parsed = {
      runtime: {},
      http: {},
    };
    for (const line of text.split('\n')) {
      LoadTestRunner.#parseRuntimeLine(parsed, line);
      LoadTestRunner.#parseHttpLine(parsed, line);
    }
    return parsed;
  }

  static #parseRuntimeLine(parsed, line) {
    const runtimeKeys = [
      'bff_node_process_start_time_seconds',
      'bff_node_process_resident_memory_bytes',
      'bff_node_nodejs_eventloop_lag_p50_seconds',
      'bff_node_nodejs_eventloop_lag_p90_seconds',
      'bff_node_nodejs_eventloop_lag_p99_seconds',
      'bff_node_nodejs_eventloop_lag_max_seconds',
    ];
    for (const key of runtimeKeys) {
      if (line.startsWith(`${key} `)) {
        parsed.runtime[key] = Number(line.slice(key.length).trim());
      }
    }
  }

  static #parseHttpLine(parsed, line) {
    const match = /^bff_http_request_duration_ms_(sum|count)\{method="([^"]+)",route="([^"]+)",status_code="([^"]+)"\}\s+(.+)$/.exec(line);
    if (!match) return;
    const [, metric, method, route, statusCode, rawValue] = match;
    const key = `${method} ${route} ${statusCode}`;
    if (!parsed.http[key]) {
      parsed.http[key] = { method, route, statusCode, sumMs: 0, count: 0, avgMs: 0 };
    }
    if (metric === 'sum') parsed.http[key].sumMs = Number(rawValue);
    if (metric === 'count') parsed.http[key].count = Number(rawValue);
    if (parsed.http[key].count > 0) {
      parsed.http[key].avgMs = Number((parsed.http[key].sumMs / parsed.http[key].count).toFixed(2));
    }
  }

  #writeSummary(summary) {
    const output = this.#config.output || path.join(
      'docs',
      'perf',
      'load-results',
      `${new Date().toISOString().replace(/[:.]/g, '-')}_${this.#config.stage}_${this.#config.vus}vu.json`,
    );
    const absolute = path.resolve(process.cwd(), output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(summary, null, 2)}\n`);
    return absolute;
  }

  static #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LoadTestRunner;
