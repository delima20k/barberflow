'use strict';

const fs = require('node:fs');
const path = require('node:path');
const LoadTestConfig = require('./LoadTestConfig');
const LoadTestMetrics = require('./LoadTestMetrics');
const LoadTestHttpClient = require('./LoadTestHttpClient');
const BarberFlowScenario = require('./BarberFlowScenario');

class LoadTestRunner {
  #config;
  #metrics;
  #client;
  #scenario;

  constructor({ config = new LoadTestConfig(), metrics = new LoadTestMetrics() } = {}) {
    this.#config = config;
    this.#metrics = metrics;
    this.#client = new LoadTestHttpClient({
      baseUrl: config.baseUrl,
      metrics,
      timeoutMs: config.timeoutMs,
    });
    this.#scenario = new BarberFlowScenario({ client: this.#client, config });
  }

  async run() {
    const endAt = Date.now() + (this.#config.durationSeconds * 1000);
    const workers = [];
    const resourceTimer = setInterval(() => this.#metrics.recordResourceSample(), 1000);

    for (let vu = 1; vu <= this.#config.vus; vu += 1) {
      workers.push(this.#runVu(vu, endAt));
    }

    await Promise.all(workers);
    clearInterval(resourceTimer);
    this.#metrics.recordResourceSample();

    const bffMetrics = await this.#collectBffMetrics();
    const summary = this.#metrics.summary({ config: this.#config, bffMetrics });
    const outputPath = this.#writeSummary(summary);
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

  async #collectBffMetrics() {
    const result = await this.#client.get('/metrics', { name: 'metrics_final' });
    if (!result.ok || typeof result.body !== 'string') return null;
    return {
      available: true,
      bytes: Buffer.byteLength(result.body),
      interestingLines: result.body
        .split('\n')
        .filter(line => /^bff_|^nodejs_|^process_/.test(line))
        .slice(0, 40),
    };
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
