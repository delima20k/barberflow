'use strict';

const crypto = require('node:crypto');
const fs     = require('node:fs/promises');
const os     = require('node:os');
const path   = require('node:path');

const { logger } = require('../../middlewares/logger');

class VideoCompressionService {
  static TARGET_BYTES = 1050 * 1024;
  static MAX_OUTPUT_BYTES = Math.floor(1.2 * 1024 * 1024);
  static SKIP_BELOW_BYTES = VideoCompressionService.MAX_OUTPUT_BYTES;
  static DEFAULT_TIMEOUT_MS = 45_000;

  #runner;
  #timeoutMs;
  #logger;

  constructor({ runner = null, timeoutMs = VideoCompressionService.DEFAULT_TIMEOUT_MS, logger: loggerInstance = logger } = {}) {
    this.#runner = runner;
    this.#timeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : VideoCompressionService.DEFAULT_TIMEOUT_MS;
    this.#logger = loggerInstance;
  }

  async compress(inputBuffer, options = {}) {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
      throw new TypeError('VideoCompressionService.compress requer Buffer nao vazio.');
    }

    const originalBytes = inputBuffer.length;
    if (this.shouldSkip(originalBytes, options)) {
      return VideoCompressionService.#result({
        bytes: inputBuffer,
        originalBytes,
        compressed: false,
        skipped: true,
      });
    }

    try {
      const compressedBytes = await this.#execute(inputBuffer);
      if (!Buffer.isBuffer(compressedBytes) || compressedBytes.length === 0) {
        throw new Error('ffmpeg retornou buffer vazio.');
      }

      if (compressedBytes.length >= originalBytes) {
        return VideoCompressionService.#result({
          bytes: inputBuffer,
          originalBytes,
          compressed: false,
          skipped: true,
          error: 'compressed_not_smaller',
        });
      }

      if (compressedBytes.length > VideoCompressionService.MAX_OUTPUT_BYTES) {
        return VideoCompressionService.#result({
          bytes: inputBuffer,
          originalBytes,
          compressed: false,
          skipped: false,
          error: 'compressed_too_large',
        });
      }

      return VideoCompressionService.#result({
        bytes: compressedBytes,
        originalBytes,
        compressed: true,
        skipped: false,
      });
    } catch (err) {
      this.#logger.warn({
        err: { message: err?.message, name: err?.name },
        originalBytes,
      }, '[media] falha ao comprimir video story; usando original');

      return VideoCompressionService.#result({
        bytes: inputBuffer,
        originalBytes,
        compressed: false,
        skipped: false,
        error: 'compression_failed',
      });
    }
  }

  shouldSkip(sizeBytes, options = {}) {
    if (options.force === true) return false;
    return Number(sizeBytes) > 0 && Number(sizeBytes) <= VideoCompressionService.SKIP_BELOW_BYTES;
  }

  async #execute(inputBuffer) {
    if (this.#runner) return this.#runner.run(inputBuffer, VideoCompressionService.#ffmpegOptions(this.#timeoutMs));
    return this.#runWithFfmpeg(inputBuffer);
  }

  async #runWithFfmpeg(inputBuffer) {
    const ffmpegPath = VideoCompressionService.#resolveFfmpegPath();
    const fluentFfmpeg = VideoCompressionService.#resolveFluentFfmpeg();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bf-video-'));
    const inputPath = path.join(tempDir, `${crypto.randomUUID()}.mp4`);
    const outputPath = path.join(tempDir, `${crypto.randomUUID()}-480p.mp4`);

    try {
      await fs.writeFile(inputPath, inputBuffer);
      await new Promise((resolve, reject) => {
        let command = fluentFfmpeg(inputPath)
          .setFfmpegPath(ffmpegPath)
          .outputOptions([
            '-c:v libx264',
            '-b:v 280k',
            '-maxrate 300k',
            '-bufsize 600k',
            '-c:a aac',
            '-b:a 48k',
            '-vf scale=480:-2,fps=24',
            '-pix_fmt yuv420p',
            '-movflags +faststart',
            '-preset faster',
          ])
          .format('mp4')
          .on('end', resolve)
          .on('error', reject)
          .save(outputPath);

        const timer = setTimeout(() => {
          command.kill('SIGKILL');
          reject(new Error('VideoCompressionService: timeout de ffmpeg.'));
        }, this.#timeoutMs);

        command.once?.('end', () => clearTimeout(timer));
        command.once?.('error', () => clearTimeout(timer));
      });

      return fs.readFile(outputPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  static #ffmpegOptions(timeoutMs) {
    return Object.freeze({
      timeoutMs,
      targetBytes: VideoCompressionService.TARGET_BYTES,
      maxOutputBytes: VideoCompressionService.MAX_OUTPUT_BYTES,
      videoBitrate: '280k',
      audioBitrate: '48k',
      maxrate: '300k',
      bufsize: '600k',
      width: 480,
      fps: 24,
      codec: 'libx264',
      format: 'mp4',
      preset: 'faster',
    });
  }

  static #result({ bytes, originalBytes, compressed, skipped, error = null }) {
    return {
      bytes,
      contentType: 'video/mp4',
      compressed,
      skipped,
      originalBytes,
      outputBytes: bytes.length,
      error,
    };
  }

  static #resolveFfmpegPath() {
    try {
      return require('ffmpeg-static'); // eslint-disable-line global-require
    } catch (err) {
      throw new Error(`ffmpeg-static indisponivel: ${err.message}`);
    }
  }

  static #resolveFluentFfmpeg() {
    try {
      return require('fluent-ffmpeg'); // eslint-disable-line global-require
    } catch (err) {
      throw new Error(`fluent-ffmpeg indisponivel: ${err.message}`);
    }
  }
}

module.exports = { VideoCompressionService };
