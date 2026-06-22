'use strict';

const crypto = require('node:crypto');
const fs     = require('node:fs/promises');
const os     = require('node:os');
const path   = require('node:path');

const { logger } = require('../../middlewares/logger');
const { FfmpegBinaries } = require('./FfmpegBinaries');

/**
 * MusicProcessingService — processa áudios de story com ffmpeg:
 *   • corta para no máximo `maxSeconds` (mantém o começo);
 *   • se a faixa for menor, preserva;
 *   • converte p/ AAC (fallback MP3) em 64–96 kbps;
 *   • normaliza volume (loudnorm).
 *
 * Runner injetável (igual VideoCompressionService) p/ testar sem ffmpeg.
 * Camada: infra
 */
class MusicProcessingService {
  static MAX_SECONDS = 35;
  static DEFAULT_KBPS = 80;          // dentro de 64–96
  static MIN_KBPS = 64;
  static MAX_KBPS = 96;
  static DEFAULT_TIMEOUT_MS = 60_000;

  #runner;
  #timeoutMs;
  #logger;

  constructor({ runner = null, timeoutMs = MusicProcessingService.DEFAULT_TIMEOUT_MS, logger: loggerInstance = logger } = {}) {
    this.#runner = runner;
    this.#timeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : MusicProcessingService.DEFAULT_TIMEOUT_MS;
    this.#logger = loggerInstance;
  }

  /**
   * @param {Buffer} inputBuffer
   * @param {{ maxSeconds?: number, targetKbps?: number, codec?: 'aac'|'mp3' }} [options]
   * @returns {Promise<{ bytes: Buffer, contentType: string, ext: string, codec: string,
   *   originalBytes: number, outputBytes: number }>}
   */
  async process(inputBuffer, options = {}) {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
      throw new TypeError('MusicProcessingService.process requer Buffer nao vazio.');
    }
    const opts = MusicProcessingService.#normalizarOpcoes(options);
    const originalBytes = inputBuffer.length;

    if (this.#runner) {
      const out = await this.#runner.run(inputBuffer, opts);
      return MusicProcessingService.#result(out, originalBytes, opts);
    }

    try {
      return await this.#runWithFfmpeg(inputBuffer, originalBytes, opts);
    } catch (err) {
      // Fallback p/ MP3 quando o AAC falha no encoder local.
      if (opts.codec === 'aac') {
        this.#logger?.warn?.({ err: { message: err?.message } }, '[music] AAC falhou; tentando MP3');
        return this.#runWithFfmpeg(inputBuffer, originalBytes, { ...opts, codec: 'mp3' });
      }
      throw err;
    }
  }

  /**
   * Duração em segundos via ffprobe (usado p/ metadados do catálogo).
   * @param {Buffer} inputBuffer
   * @returns {Promise<number>}
   */
  async inspect(inputBuffer) {
    if (this.#runner?.inspect) return this.#runner.inspect(inputBuffer);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bf-audio-probe-'));
    const inputPath = path.join(tempDir, `${crypto.randomUUID()}.mp3`);
    try {
      await fs.writeFile(inputPath, inputBuffer);
      return await this.inspectPath(inputPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Duração (s) sondando diretamente um arquivo (sem ler em buffer). */
  async inspectPath(filePath) {
    if (this.#runner?.inspectPath) return this.#runner.inspectPath(filePath);
    const fluent = FfmpegBinaries.fluent();
    fluent.setFfprobePath?.(FfmpegBinaries.ffprobePath());
    return new Promise((resolve, reject) => {
      fluent.ffprobe(filePath, (err, data) => {
        if (err) return reject(err);
        resolve(Number(data?.format?.duration) || 0);
      });
    });
  }

  async #runWithFfmpeg(inputBuffer, originalBytes, opts) {
    const ext = opts.codec === 'mp3' ? 'mp3' : 'm4a';
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bf-audio-'));
    const inputPath = path.join(tempDir, `${crypto.randomUUID()}.mp3`);
    const outputPath = path.join(tempDir, `${crypto.randomUUID()}.${ext}`);

    try {
      await fs.writeFile(inputPath, inputBuffer);
      await new Promise((resolve, reject) => {
        const command = FfmpegBinaries.comando(inputPath)
          .noVideo()
          .audioFilters('loudnorm')
          .outputOptions(MusicProcessingService.#outputOptions(opts))
          .duration(opts.maxSeconds)
          .format(opts.codec === 'mp3' ? 'mp3' : 'ipod') // ipod = container m4a (AAC)
          .on('end', resolve)
          .on('error', reject)
          .save(outputPath);

        const timer = setTimeout(() => {
          try { command.kill('SIGKILL'); } catch (_) {}
          reject(new Error('MusicProcessingService: timeout de ffmpeg.'));
        }, this.#timeoutMs);
        command.once?.('end', () => clearTimeout(timer));
        command.once?.('error', () => clearTimeout(timer));
      });

      const bytes = await fs.readFile(outputPath);
      if (!bytes.length) throw new Error('ffmpeg retornou arquivo vazio.');
      return MusicProcessingService.#result({ bytes, ext, codec: opts.codec }, originalBytes, opts);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  static #outputOptions(opts) {
    return [
      `-c:a ${opts.codec === 'mp3' ? 'libmp3lame' : 'aac'}`,
      `-b:a ${opts.targetKbps}k`,
      '-ac 2',
      '-ar 44100',
      '-movflags +faststart',
    ];
  }

  static #normalizarOpcoes(options = {}) {
    const maxSeconds = Number(options.maxSeconds) > 0 ? Number(options.maxSeconds) : MusicProcessingService.MAX_SECONDS;
    let targetKbps = Number(options.targetKbps) > 0 ? Number(options.targetKbps) : MusicProcessingService.DEFAULT_KBPS;
    targetKbps = Math.min(MusicProcessingService.MAX_KBPS, Math.max(MusicProcessingService.MIN_KBPS, targetKbps));
    const codec = options.codec === 'mp3' ? 'mp3' : 'aac';
    return { maxSeconds, targetKbps, codec };
  }

  static #result(out, originalBytes, opts) {
    const bytes = out.bytes;
    const codec = out.codec ?? opts.codec;
    const ext = out.ext ?? (codec === 'mp3' ? 'mp3' : 'm4a');
    return {
      bytes,
      codec,
      ext,
      contentType: codec === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
      originalBytes,
      outputBytes: Buffer.isBuffer(bytes) ? bytes.length : 0,
    };
  }
}

module.exports = { MusicProcessingService };
