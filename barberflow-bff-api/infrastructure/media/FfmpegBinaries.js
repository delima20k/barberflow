'use strict';

/**
 * FfmpegBinaries — resolve os binários ffmpeg/ffprobe e o módulo fluent-ffmpeg,
 * com mensagens de erro claras. Centraliza a resolução p/ reuso (DRY).
 *
 * ffmpeg: via `ffmpeg-static`.
 * ffprobe: `FFPROBE_PATH` (env) → `@ffprobe-installer/ffprobe` → 'ffprobe' (PATH).
 *
 * Camada: infra
 */
class FfmpegBinaries {
  static ffmpegPath() {
    try {
      return require('ffmpeg-static'); // eslint-disable-line global-require
    } catch (err) {
      throw new Error(`ffmpeg-static indisponivel: ${err.message}`);
    }
  }

  static ffprobePath() {
    if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
    try {
      const installer = require('@ffprobe-installer/ffprobe'); // eslint-disable-line global-require
      if (installer?.path) return installer.path;
    } catch (_) { /* não instalado — segue p/ PATH */ }
    return 'ffprobe'; // assume no PATH do sistema
  }

  static fluent() {
    try {
      return require('fluent-ffmpeg'); // eslint-disable-line global-require
    } catch (err) {
      throw new Error(`fluent-ffmpeg indisponivel: ${err.message}`);
    }
  }

  /** Instância fluent-ffmpeg já com os caminhos de ffmpeg/ffprobe configurados. */
  static comando(input) {
    const fluent = FfmpegBinaries.fluent();
    const cmd = fluent(input).setFfmpegPath(FfmpegBinaries.ffmpegPath());
    try { cmd.setFfprobePath(FfmpegBinaries.ffprobePath()); } catch (_) { /* opcional */ }
    return cmd;
  }
}

module.exports = { FfmpegBinaries };
