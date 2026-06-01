'use strict';

/**
 * MediaPipelineMetrics - agregados em memoria por processo para observabilidade.
 */
class MediaPipelineMetrics {
  #steps = new Map();
  #mediaCount = 0;
  #totalBytes = 0;

  recordStep(name, durationMs, error = null) {
    const step = this.#steps.get(name) ?? { count: 0, failures: 0, totalMs: 0 };
    step.count += 1;
    step.totalMs += durationMs;
    if (error) step.failures += 1;
    this.#steps.set(name, step);
  }

  recordMedia(sizeBytes) {
    this.#mediaCount += 1;
    this.#totalBytes += Number(sizeBytes ?? 0);
  }

  snapshot() {
    const steps = {};
    for (const [name, stat] of this.#steps.entries()) {
      steps[name] = {
        count: stat.count,
        averageMs: stat.count ? Math.round(stat.totalMs / stat.count) : 0,
        failureRate: stat.count ? stat.failures / stat.count : 0,
      };
    }
    return {
      steps,
      processed: this.#mediaCount,
      averageSizeBytes: this.#mediaCount ? Math.round(this.#totalBytes / this.#mediaCount) : 0,
    };
  }
}

module.exports = { MediaPipelineMetrics };
