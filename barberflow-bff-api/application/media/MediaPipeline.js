'use strict';

const { MediaPipelineMetrics } = require('./MediaPipelineMetrics');

/**
 * MediaPipeline - Chain of Responsibility para steps assincronos de midia.
 *
 * @typedef {object} MediaPipelineInput
 * @property {string} mediaId
 * @property {string} ownerId
 * @property {string} context
 * @property {{ bucket: string, path: string, bytes: Buffer, contentType: string, sizeBytes: number }} source
 * @property {Array<object>} variants
 * @property {Record<string, any>} metadata
 */
class MediaPipeline {
  #steps;
  #metrics;

  constructor(steps, metrics = new MediaPipelineMetrics()) {
    if (!Array.isArray(steps) || steps.some(step => typeof step?.handle !== 'function')) {
      throw new TypeError('MediaPipeline: steps devem implementar handle()');
    }
    this.#steps = [...steps];
    this.#metrics = metrics;
  }

  /** @param {MediaPipelineInput} input */
  async process(input) {
    let current = input;
    this.#metrics.recordMedia(input?.source?.sizeBytes);
    for (const step of this.#steps) {
      const startedAt = Date.now();
      try {
        current = await step.handle(current);
        this.#metrics.recordStep(step.name, Date.now() - startedAt);
      } catch (error) {
        this.#metrics.recordStep(step.name, Date.now() - startedAt, error);
        throw error;
      }
    }
    return current;
  }

  get metrics() {
    return this.#metrics.snapshot();
  }
}

module.exports = { MediaPipeline };
