'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const { VideoCompressionService } = require('../../../../infrastructure/media/VideoCompressionService');

const silentLogger = { warn: () => {} };

describe('VideoCompressionService', () => {
  it('comprime video valido usando runner injetado', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    const compressed = Buffer.alloc(900 * 1024, 2);
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
    assert.equal(runnerOptions.videoBitrate, '176k');
    assert.equal(runnerOptions.audioBitrate, '64k');
    assert.equal(runnerOptions.width, 480);
    assert.equal(runnerOptions.fps, 24);
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

  it('nao recomprime video que ja esta abaixo do alvo', async () => {
    const original = Buffer.alloc(600 * 1024, 1);
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
});
