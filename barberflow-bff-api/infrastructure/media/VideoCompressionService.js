'use strict';

const crypto        = require('node:crypto');
const fs            = require('node:fs/promises');
const os            = require('node:os');
const path          = require('node:path');
const { execFile }  = require('node:child_process');

const { logger } = require('../../middlewares/logger');

class VideoCompressionService {
  // Alvo de tamanho final que o bitrate de video mira (ver
  // #calcularBitrateVideoBps) — alinhado ao alvo real do StoryComposer no
  // cliente (ALVO_VIDEO = 3MB, StoryCreationModal.js). Antes era só um campo
  // informativo (1.35MB) sem nenhum efeito no encode; agora dirige o cálculo
  // de bitrate por duração.
  static TARGET_BYTES = Math.floor(3.3 * 1024 * 1024);
  // Precisa ficar acima de TARGET_BYTES com folga pra variação normal do
  // encoder CBR não rejeitar um resultado válido como "grande demais".
  static MAX_OUTPUT_BYTES = Math.floor(4 * 1024 * 1024);
  // Alinhado ao alvo real do StoryComposer no cliente (ALVO_VIDEO = 3MB,
  // StoryCreationModal.js), com folga até a margem de retry dele (targetBytes*1.3
  // = ~3.9MB). Antes era igual a MAX_OUTPUT_BYTES (1.5MB) — bem abaixo do que o
  // cliente já entrega comprimido — fazendo o servidor recomprimir de novo (a
  // 330kbps/480p) quase todo video que o cliente ja tinha otimizado corretamente.
  static SKIP_BELOW_BYTES = Math.floor(3.5 * 1024 * 1024);
  static DEFAULT_TIMEOUT_MS = 45_000;

  // Piso de bitrate de vídeo — mesmo valor usado pelo StoryComposer no
  // cliente (StoryCreationModal.js) — evita bitrate absurdamente baixo em
  // durações muito longas.
  static #MIN_VIDEO_BITRATE_BPS = 120_000;
  // Precisa bater com '-b:a 48k' em #montarArgumentosFfmpeg — usado só pra
  // descontar do orçamento total antes de calcular o bitrate de vídeo.
  static #AUDIO_BITRATE_BPS = 48_000;
  // Duração assumida quando a sonda de duração falha (ex.: buffer
  // corrompido/ilegível) — mesmo teto de duração que o StoryComposer usa no
  // cliente (maxSeconds: 30). Assumir o pior caso (mais longo) produz um
  // bitrate mais conservador (menor), nunca estourando o orçamento por
  // falta de dado real.
  static #FALLBACK_DURATION_SECONDS = 30;

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

      if (compressedBytes.length > VideoCompressionService.MAX_OUTPUT_BYTES) {
        return VideoCompressionService.#result({
          bytes: inputBuffer,
          originalBytes,
          compressed: false,
          skipped: false,
          error: 'compressed_too_large',
        });
      }

      if (compressedBytes.length >= originalBytes && options.force !== true) {
        return VideoCompressionService.#result({
          bytes: inputBuffer,
          originalBytes,
          compressed: false,
          skipped: true,
          error: 'compressed_not_smaller',
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

      // Duração real via o próprio binário ffmpeg (ffprobe não é uma
      // dependência do projeto — só ffmpeg-static/fluent-ffmpeg). `ffmpeg -i`
      // sem saída lê os cabeçalhos/streams e imprime "Duration: HH:MM:SS.ss"
      // no stderr antes de sair com erro (esperado — não pedimos encode
      // nessa chamada), sem decodificar o vídeo inteiro.
      const duracaoSegundos = await VideoCompressionService.#obterDuracaoSegundos(ffmpegPath, inputPath);
      const bitrateVideoBps = VideoCompressionService.#calcularBitrateVideoBps(duracaoSegundos);
      const argumentos = VideoCompressionService.#montarArgumentosFfmpeg(bitrateVideoBps);

      await new Promise((resolve, reject) => {
        let command = fluentFfmpeg(inputPath)
          .setFfmpegPath(ffmpegPath)
          .outputOptions(argumentos)
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

  /**
   * Lê a duração real do vídeo em segundos usando o próprio binário ffmpeg
   * (`ffmpeg -i <path>`, sem saída — lê só os cabeçalhos). Resolve `null`
   * se a duração não puder ser determinada (ex.: arquivo corrompido); quem
   * chama trata isso assumindo o pior caso (#FALLBACK_DURATION_SECONDS).
   * @param {string} ffmpegPath
   * @param {string} inputPath
   * @returns {Promise<number|null>}
   */
  static #obterDuracaoSegundos(ffmpegPath, inputPath) {
    return new Promise((resolve) => {
      execFile(ffmpegPath, ['-i', inputPath], (_err, _stdout, stderr) => {
        const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(String(stderr ?? ''));
        if (!match) { resolve(null); return; }
        const [, horas, minutos, segundos] = match;
        const total = Number(horas) * 3600 + Number(minutos) * 60 + Number(segundos);
        resolve(Number.isFinite(total) && total > 0 ? total : null);
      });
    });
  }

  /**
   * Bitrate de vídeo (bps) proporcional à duração, mirando TARGET_BYTES no
   * arquivo final — mesma fórmula usada pelo StoryComposer no cliente
   * (StoryCreationModal.js): orçamento total em bits / duração, com uma
   * margem de 10% e descontando o bitrate de áudio fixo.
   * @param {number|null} durationSeconds — null cai no pior caso (30s)
   * @returns {number}
   */
  static #calcularBitrateVideoBps(durationSeconds) {
    const segundos = Number(durationSeconds) > 0
      ? Number(durationSeconds)
      : VideoCompressionService.#FALLBACK_DURATION_SECONDS;
    const bitrateTotalBps = Math.floor((VideoCompressionService.TARGET_BYTES * 8 / segundos) * 0.9);
    const bitrateVideoBps = bitrateTotalBps - VideoCompressionService.#AUDIO_BITRATE_BPS;
    return Math.max(VideoCompressionService.#MIN_VIDEO_BITRATE_BPS, bitrateVideoBps);
  }

  static #paraKbps(bps) {
    return `${Math.max(1, Math.round(bps / 1000))}k`;
  }

  /**
   * Monta os outputOptions do ffmpeg com o bitrate de vídeo calculado.
   * Mantém a MESMA relação entre b:v/minrate/maxrate/bufsize de antes
   * (minrate = b:v; maxrate = b:v + 20k; bufsize = 2x maxrate) — só o
   * número muda, o modo CBR (nal-hrd=cbr:force-cfr=1) continua igual.
   * Resolução (480p) e FPS (24) inalterados.
   * @param {number} bitrateVideoBps
   * @returns {string[]}
   */
  static #montarArgumentosFfmpeg(bitrateVideoBps) {
    const videoK = VideoCompressionService.#paraKbps(bitrateVideoBps);
    const maxrateK = VideoCompressionService.#paraKbps(bitrateVideoBps + 20_000);
    const bufsizeK = VideoCompressionService.#paraKbps((bitrateVideoBps + 20_000) * 2);
    return [
      '-c:v libx264',
      `-b:v ${videoK}`,
      `-minrate ${videoK}`,
      `-maxrate ${maxrateK}`,
      `-bufsize ${bufsizeK}`,
      '-x264-params nal-hrd=cbr:force-cfr=1',
      '-c:a aac',
      '-b:a 48k',
      '-vf scale=480:-2,fps=24',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      '-preset fast',
    ];
  }

  static #ffmpegOptions(timeoutMs) {
    // Caminho do runner injetado (testes) não tem acesso à duração real de
    // um arquivo em disco — usa o mesmo pior-caso conservador do fallback
    // (#FALLBACK_DURATION_SECONDS) usado quando a sonda real falha.
    const bitrateVideoBps = VideoCompressionService.#calcularBitrateVideoBps(null);
    return Object.freeze({
      timeoutMs,
      targetBytes: VideoCompressionService.TARGET_BYTES,
      maxOutputBytes: VideoCompressionService.MAX_OUTPUT_BYTES,
      videoBitrate: VideoCompressionService.#paraKbps(bitrateVideoBps),
      audioBitrate: '48k',
      minrate: VideoCompressionService.#paraKbps(bitrateVideoBps),
      maxrate: VideoCompressionService.#paraKbps(bitrateVideoBps + 20_000),
      bufsize: VideoCompressionService.#paraKbps((bitrateVideoBps + 20_000) * 2),
      rateControl: 'cbr',
      width: 480,
      fps: 24,
      codec: 'libx264',
      format: 'mp4',
      preset: 'fast',
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
