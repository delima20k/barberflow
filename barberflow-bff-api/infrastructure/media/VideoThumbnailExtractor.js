'use strict';

const os   = require('node:os');
const fs   = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class VideoThumbnailExtractor {
  #runFfmpeg;

  /**
   * @param {{ runFfmpeg?: (inPath: string, outPath: string) => Promise<void> }} opts
   *   Injeta `runFfmpeg` nos testes para evitar execução real do binário.
   */
  constructor({ runFfmpeg } = {}) {
    this.#runFfmpeg = runFfmpeg ?? VideoThumbnailExtractor.#defaultRunner;
  }

  /**
   * Extrai o primeiro frame de um buffer de vídeo MP4.
   * Retorna null em caso de erro (graceful degradation — não impede o pipeline).
   * @param {Buffer} sourceBuffer
   * @returns {Promise<Buffer|null>}
   */
  async extract(sourceBuffer) {
    const id      = randomUUID();
    const inPath  = path.join(os.tmpdir(), `vthumb_in_${id}.mp4`);
    const outPath = path.join(os.tmpdir(), `vthumb_out_${id}.jpg`);

    try {
      await fs.promises.writeFile(inPath, sourceBuffer);
      await this.#runFfmpeg(inPath, outPath);
      return await fs.promises.readFile(outPath);
    } catch {
      return null;
    } finally {
      for (const p of [inPath, outPath]) {
        fs.promises.unlink(p).catch(() => {});
      }
    }
  }

  static #defaultRunner(inPath, outPath) {
    const ffmpegPath   = require('ffmpeg-static');
    const fluent       = require('fluent-ffmpeg');
    fluent.setFfmpegPath(ffmpegPath);

    const tryAt = (seekSec) =>
      new Promise((resolve, reject) => {
        fluent(inPath)
          .seekInput(seekSec)
          .frames(1)
          .output(outPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

    // Tenta 0.5s; se falhar (vídeo muito curto), tenta no frame 0
    return tryAt(0.5).catch(() => tryAt(0));
  }
}

module.exports = { VideoThumbnailExtractor };
