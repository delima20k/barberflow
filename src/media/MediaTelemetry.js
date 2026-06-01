'use strict';

class MediaTelemetry {
  #logger;
  #timer;
  #stats = new Map();

  constructor({ logger = null, timer = { now: () => Date.now() } } = {}) {
    this.#logger = logger;
    this.#timer = timer;
  }

  start(stage, attrs = {}) {
    const startedAt = this.#timer.now();
    this.#log('debug', 'media.stage.start', { stage, ...attrs });
    return {
      end: (extra = {}) => this.recordSuccess(stage, this.#timer.now() - startedAt, { ...attrs, ...extra }),
      fail: (error, extra = {}) => this.recordFailure(stage, this.#timer.now() - startedAt, error, { ...attrs, ...extra }),
    };
  }

  recordSuccess(stage, durationMs, attrs = {}) {
    const stat = this.#entry(stage);
    stat.count += 1;
    stat.success += 1;
    stat.totalMs += durationMs;
    if (Number.isFinite(attrs.inputBytes)) stat.inputBytes += attrs.inputBytes;
    if (Number.isFinite(attrs.outputBytes)) stat.outputBytes += attrs.outputBytes;
    this.#log('info', 'media.stage.success', { stage, durationMs, ...attrs });
  }

  recordFailure(stage, durationMs, error, attrs = {}) {
    const stat = this.#entry(stage);
    stat.count += 1;
    stat.failure += 1;
    stat.totalMs += durationMs;
    this.#log('warn', 'media.stage.failure', {
      stage,
      durationMs,
      errorName: error?.name,
      errorCode: error?.code,
      errorMessage: error?.message,
      ...attrs,
    });
  }

  snapshot() {
    return [...this.#stats.entries()].reduce((acc, [stage, stat]) => {
      acc[stage] = {
        count: stat.count,
        success: stat.success,
        failure: stat.failure,
        averageMs: stat.count ? +(stat.totalMs / stat.count).toFixed(2) : 0,
        averageInputBytes: stat.count ? Math.round(stat.inputBytes / stat.count) : 0,
        averageOutputBytes: stat.count ? Math.round(stat.outputBytes / stat.count) : 0,
      };
      return acc;
    }, {});
  }

  #entry(stage) {
    if (!this.#stats.has(stage)) {
      this.#stats.set(stage, { count: 0, success: 0, failure: 0, totalMs: 0, inputBytes: 0, outputBytes: 0 });
    }
    return this.#stats.get(stage);
  }

  #log(level, message, payload) {
    const target = this.#logger?.[level] ?? this.#logger?.info ?? (() => {});
    target.call(this.#logger, { scope: 'media', ...payload }, message);
  }
}

module.exports = MediaTelemetry;
