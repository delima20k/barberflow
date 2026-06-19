'use strict';

const { VideoCompressionService } = require('./VideoCompressionService');

/**
 * FfmpegVideoTranscoder - adapter de transcode assíncrono para o pipeline.
 *
 * Mantém ffmpeg fora do fluxo HTTP: o worker recebe o source já confirmado,
 * gera a variante video_480p e deixa o CDNPublishStep persistir no R2.
 */
class FfmpegVideoTranscoder {
  static #active = 0;
  static #queue = [];

  #compression;
  #concurrency;

  constructor({ compression = new VideoCompressionService(), concurrency = process.env.STORY_VIDEO_TRANSCODE_CONCURRENCY } = {}) {
    if (!compression || typeof compression.compress !== 'function') {
      throw new TypeError('FfmpegVideoTranscoder: compression invalido');
    }
    this.#compression = compression;
    this.#concurrency = Math.max(1, Number(concurrency) || 1);
  }

  async transcode(input) {
    if (input?.metadata?.mediaKind !== 'video') return [];
    const result = await this.#withSlot(() => this.#compression.compress(input.source.bytes));
    if (result.error) {
      throw new Error('video_processing_failed');
    }
    return [{
      name: 'video_480p',
      contentType: result.contentType,
      bytes: result.bytes,
      ext: 'mp4',
      width: result.skipped ? null : 480,
      metadata: {
        compressed: result.compressed,
        skipped: result.skipped,
        originalBytes: result.originalBytes,
        outputBytes: result.outputBytes,
        error: result.error,
      },
    }];
  }

  async #withSlot(task) {
    await this.#acquire();
    try {
      return await task();
    } finally {
      FfmpegVideoTranscoder.#release();
    }
  }

  async #acquire() {
    if (FfmpegVideoTranscoder.#active < this.#concurrency) {
      FfmpegVideoTranscoder.#active += 1;
      return;
    }
    await new Promise(resolve => FfmpegVideoTranscoder.#queue.push(resolve));
    FfmpegVideoTranscoder.#active += 1;
  }

  static #release() {
    FfmpegVideoTranscoder.#active = Math.max(0, FfmpegVideoTranscoder.#active - 1);
    const next = FfmpegVideoTranscoder.#queue.shift();
    if (next) next();
  }
}

module.exports = { FfmpegVideoTranscoder };
