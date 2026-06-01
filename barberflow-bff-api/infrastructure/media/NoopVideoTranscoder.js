'use strict';

/**
 * NoopVideoTranscoder - evita transcode inline ate haver worker ffmpeg dedicado.
 */
class NoopVideoTranscoder {
  async transcode() {
    return [];
  }
}

module.exports = { NoopVideoTranscoder };
