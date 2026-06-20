'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const { VideoCompressionService } = require('../../../../infrastructure/media/VideoCompressionService');

const silentLogger = { warn: () => {} };

describe('VideoCompressionService', () => {
  it('comprime video valido usando runner injetado', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    const compressed = Buffer.alloc(960 * 1024, 2);
    let runnerOptions = null;
    const service = new VideoCompressionService({
      logger: silentLogger,
      runner: {
        run: async (_input, options) => {
          runnerOptions = options;
          return compressed;
        },
      },
    });

    const result = await service.compress(original);

    assert.equal(result.compressed, true);
    assert.equal(result.outputBytes, compressed.length);
    assert.equal(result.contentType, 'video/mp4');
    assert.equal(runnerOptions.videoBitrate, '220k');
    assert.equal(runnerOptions.audioBitrate, '40k');
    assert.equal(runnerOptions.minrate, '220k');
    assert.equal(runnerOptions.maxrate, '230k');
    assert.equal(runnerOptions.bufsize, '460k');
    assert.equal(runnerOptions.rateControl, 'cbr');
    assert.equal(runnerOptions.width, 480);
    assert.equal(runnerOptions.fps, 24);
    assert.equal(runnerOptions.preset, 'fast');
    assert.equal(runnerOptions.targetBytes, 960 * 1024);
    assert.equal(runnerOptions.maxOutputBytes, VideoCompressionService.MAX_OUTPUT_BYTES);
    assert.equal(VideoCompressionService.MAX_OUTPUT_BYTES, 1024 * 1024);
  });

  it('usa original como fallback quando video esta corrompido', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    let logged = false;
    const service = new VideoCompressionService({
      logger: { warn: () => { logged = true; } },
      runner: {
        run: async () => {
          throw new Error('invalid data found when processing input');
        },
      },
    });

    const result = await service.compress(original);

    assert.equal(result.compressed, false);
    assert.equal(result.error, 'compression_failed');
    assert.equal(result.bytes, original);
    assert.equal(logged, true);
  });

  it('nao recomprime video que ja esta abaixo do teto maximo', async () => {
    const original = Buffer.alloc(900 * 1024, 1);
    let called = false;
    const service = new VideoCompressionService({
      logger: silentLogger,
      runner: {
        run: async () => {
          called = true;
          return Buffer.alloc(500 * 1024, 2);
        },
      },
    });

    const result = await service.compress(original);

    assert.equal(result.skipped, true);
    assert.equal(result.compressed, false);
    assert.equal(result.bytes, original);
    assert.equal(called, false);
  });

  it('aceita recompressao forcada maior que o original quando fica dentro de 1MB', async () => {
    const original = Buffer.alloc(813 * 1024, 1);
    const recompressed = Buffer.alloc(980 * 1024, 2);
    let called = false;
    const service = new VideoCompressionService({
      logger: silentLogger,
      runner: {
        run: async () => {
          called = true;
          return recompressed;
        },
      },
    });

    const result = await service.compress(original, { force: true });

    assert.equal(called, true);
    assert.equal(result.compressed, true);
    assert.equal(result.skipped, false);
    assert.equal(result.error, null);
    assert.equal(result.outputBytes, recompressed.length);
    assert.equal(result.bytes, recompressed);
  });

  it('marca erro quando a compressao ainda fica acima de 1MB', async () => {
    const original = Buffer.alloc(4 * 1024 * 1024, 1);
    const oversized = Buffer.alloc(VideoCompressionService.MAX_OUTPUT_BYTES + 1, 2);
    const service = new VideoCompressionService({
      logger: silentLogger,
      runner: {
        run: async () => oversized,
      },
    });

    const result = await service.compress(original);

    assert.equal(result.compressed, false);
    assert.equal(result.error, 'compressed_too_large');
    assert.equal(result.outputBytes, original.length);
    assert.equal(result.bytes, original);
  });
});
