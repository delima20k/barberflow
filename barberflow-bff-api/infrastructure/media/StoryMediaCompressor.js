'use strict';

const crypto = require('node:crypto');
const fs     = require('node:fs/promises');
const os     = require('node:os');
const path   = require('node:path');

/**
 * StoryMediaCompressor — compressão reutilizável de mídia de stories para um
 * teto de tamanho (padrão 2 MB), mantendo a melhor qualidade possível dentro
 * do limite.
 *
 *   • Imagem → WebP via sharp (redimensiona ≤ maxLado, laço de qualidade).
 *   • Vídeo  → H.264/AAC via ffmpeg-static + fluent-ffmpeg (laço de CRF +
 *     downscale, sem depender de ffprobe).
 *
 * Não acessa rede nem persiste nada — recebe/retorna Buffer. Usado pelo script
 * batch (scripts/compress-stories-media.js) e reutilizável em outros fluxos.
 *
 * Camada: infra
 */
class StoryMediaCompressor {
  static DEFAULT_TARGET_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
  static DEFAULT_MAX_LADO     = 1080;
  static VIDEO_TIMEOUT_MS     = 180_000;

  #logger;

  constructor({ logger = console } = {}) {
    this.#logger = logger;
  }

  // ── Imagem ──────────────────────────────────────────────────

  /**
   * Comprime uma imagem para WebP dentro de targetBytes.
   * @param {Buffer} inputBuffer
   * @param {{ targetBytes?: number, maxLado?: number }} [opts]
   * @returns {Promise<{ buffer: Buffer, contentType: string, originalBytes: number, bytes: number, ok: boolean }>}
   */
  async compressImage(inputBuffer, { targetBytes = StoryMediaCompressor.DEFAULT_TARGET_BYTES, maxLado = StoryMediaCompressor.DEFAULT_MAX_LADO } = {}) {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
      throw new TypeError('StoryMediaCompressor.compressImage requer Buffer nao vazio.');
    }
    const sharp = StoryMediaCompressor.#resolveSharp();
    const originalBytes = inputBuffer.length;

    const gerar = (lado, quality) => sharp(inputBuffer, { failOn: 'none' })
      .rotate() // respeita orientação EXIF
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    let menor = null; // rede de segurança: menor blob gerado
    // Primeiro tenta na resolução cheia, baixando a qualidade; depois reduz a resolução.
    const tentativas = [
      ...[90, 82, 74, 64, 54, 44].map(q => ({ lado: maxLado, q })),
      { lado: Math.round(maxLado * 0.7), q: 60 },
      { lado: Math.round(maxLado * 0.5), q: 55 },
    ];
    for (const { lado, q } of tentativas) {
      const out = await gerar(lado, q);
      if (!menor || out.length < menor.length) menor = out;
      if (out.length <= targetBytes) {
        return StoryMediaCompressor.#resImg(out, originalBytes, true);
      }
    }
    return StoryMediaCompressor.#resImg(menor, originalBytes, menor.length <= targetBytes);
  }

  // ── Vídeo ───────────────────────────────────────────────────

  /**
   * Comprime um vídeo para H.264/AAC dentro de targetBytes (laço de CRF + downscale).
   * @param {Buffer} inputBuffer
   * @param {{ targetBytes?: number, maxLado?: number, timeoutMs?: number }} [opts]
   * @returns {Promise<{ buffer: Buffer, contentType: string, originalBytes: number, bytes: number, ok: boolean }>}
   */
  async compressVideo(inputBuffer, {
    targetBytes = StoryMediaCompressor.DEFAULT_TARGET_BYTES,
    maxLado     = StoryMediaCompressor.DEFAULT_MAX_LADO,
    timeoutMs   = StoryMediaCompressor.VIDEO_TIMEOUT_MS,
  } = {}) {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
      throw new TypeError('StoryMediaCompressor.compressVideo requer Buffer nao vazio.');
    }
    const originalBytes = inputBuffer.length;
    // Qualidade primeiro (CRF baixo); se estourar, sobe CRF e reduz resolução.
    const tentativas = [
      { crf: 22, lado: maxLado },
      { crf: 26, lado: maxLado },
      { crf: 28, lado: maxLado },
      { crf: 30, lado: Math.min(720, maxLado) },
      { crf: 34, lado: Math.min(480, maxLado) },
    ];
    let menor = null;
    for (const t of tentativas) {
      let out = null;
      try { out = await this.#encodeVideo(inputBuffer, t, timeoutMs); }
      catch (err) { this.#logger.warn?.(`[StoryMediaCompressor] encode falhou (crf=${t.crf} lado=${t.lado}): ${err?.message ?? err}`); continue; }
      if (!out || !out.length) continue;
      if (!menor || out.length < menor.length) menor = out;
      if (out.length <= targetBytes) {
        return StoryMediaCompressor.#resVid(out, originalBytes, true);
      }
    }
    if (!menor) throw new Error('StoryMediaCompressor: falha ao comprimir video (ffmpeg).');
    return StoryMediaCompressor.#resVid(menor, originalBytes, menor.length <= targetBytes);
  }

  async #encodeVideo(inputBuffer, { crf, lado }, timeoutMs) {
    const ffmpegPath   = StoryMediaCompressor.#resolveFfmpegPath();
    const fluentFfmpeg = StoryMediaCompressor.#resolveFluentFfmpeg();
    const tempDir   = await fs.mkdtemp(path.join(os.tmpdir(), 'bf-story-vid-'));
    const inputPath = path.join(tempDir, `${crypto.randomUUID()}.in.mp4`);
    const outputPath = path.join(tempDir, `${crypto.randomUUID()}.out.mp4`);
    // Caixa lado×lado, só reduz, dimensões pares — limita o maior lado a `lado`.
    const vf = `scale=${lado}:${lado}:force_original_aspect_ratio=decrease:force_divisible_by=2`;

    try {
      await fs.writeFile(inputPath, inputBuffer);
      await new Promise((resolve, reject) => {
        const command = fluentFfmpeg(inputPath)
          .setFfmpegPath(ffmpegPath)
          .outputOptions([
            '-c:v libx264',
            `-crf ${crf}`,
            '-preset medium',
            `-vf ${vf}`,
            '-r 30',
            '-pix_fmt yuv420p',
            '-c:a aac',
            '-b:a 96k',
            '-movflags +faststart',
          ])
          .format('mp4')
          .on('end', resolve)
          .on('error', reject)
          .save(outputPath);

        const timer = setTimeout(() => {
          try { command.kill('SIGKILL'); } catch (_) {}
          reject(new Error('timeout de ffmpeg'));
        }, timeoutMs);
        command.once?.('end', () => clearTimeout(timer));
        command.once?.('error', () => clearTimeout(timer));
      });
      return await fs.readFile(outputPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  static #resImg(buffer, originalBytes, ok) {
    return { buffer, contentType: 'image/webp', originalBytes, bytes: buffer.length, ok };
  }

  static #resVid(buffer, originalBytes, ok) {
    return { buffer, contentType: 'video/mp4', originalBytes, bytes: buffer.length, ok };
  }

  static #resolveSharp() {
    try { return require('sharp'); } // eslint-disable-line global-require
    catch (err) { throw new Error(`sharp indisponivel: ${err.message}`); }
  }

  static #resolveFfmpegPath() {
    try { return require('ffmpeg-static'); } // eslint-disable-line global-require
    catch (err) { throw new Error(`ffmpeg-static indisponivel: ${err.message}`); }
  }

  static #resolveFluentFfmpeg() {
    try { return require('fluent-ffmpeg'); } // eslint-disable-line global-require
    catch (err) { throw new Error(`fluent-ffmpeg indisponivel: ${err.message}`); }
  }
}

module.exports = { StoryMediaCompressor };
