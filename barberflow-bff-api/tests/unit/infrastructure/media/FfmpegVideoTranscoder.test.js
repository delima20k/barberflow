'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { FfmpegVideoTranscoder } = require('../../../../infrastructure/media/FfmpegVideoTranscoder');

describe('FfmpegVideoTranscoder', () => {
  it('gera variante video_480p usando VideoCompressionService', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    const compressed = Buffer.alloc(900 * 1024, 2);
    const transcoder = new FfmpegVideoTranscoder({
      compression: {
        compress: async (bytes) => {
          assert.equal(bytes, original);
          return {
            bytes: compressed,
            contentType: 'video/mp4',
            compressed: true,
            skipped: false,
            originalBytes: original.length,
            outputBytes: compressed.length,
            error: null,
          };
        },
      },
    });

    const variants = await transcoder.transcode({
      source: { bytes: original },
      metadata: { mediaKind: 'video' },
    });

    assert.equal(variants.length, 1);
    assert.equal(variants[0].name, 'video_480p');
    assert.equal(variants[0].contentType, 'video/mp4');
    assert.equal(variants[0].bytes, compressed);
    assert.equal(variants[0].metadata.outputBytes, compressed.length);
  });

  it('preserva variante quando compressao pula arquivo abaixo do alvo', async () => {
    const original = Buffer.alloc(500 * 1024, 1);
    const transcoder = new FfmpegVideoTranscoder({
      compression: {
        compress: async () => ({
          bytes: original,
          contentType: 'video/mp4',
          compressed: false,
          skipped: true,
          originalBytes: original.length,
          outputBytes: original.length,
          error: null,
        }),
      },
    });

    const variants = await transcoder.transcode({
      source: { bytes: original },
      metadata: { mediaKind: 'video' },
    });

    assert.equal(variants[0].name, 'video_480p');
    assert.equal(variants[0].bytes, original);
    assert.equal(variants[0].metadata.skipped, true);
  });

  it('ignora midia que nao seja video', async () => {
    const transcoder = new FfmpegVideoTranscoder({
      compression: { compress: async () => { throw new Error('nao deve chamar'); } },
    });

    const variants = await transcoder.transcode({
      source: { bytes: Buffer.from('image') },
      metadata: { mediaKind: 'image' },
    });

    assert.deepEqual(variants, []);
  });

  it('falha de forma sanitizada quando compressao retorna erro', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    const transcoder = new FfmpegVideoTranscoder({
      compression: {
        compress: async () => ({
          bytes: original,
          contentType: 'video/mp4',
          compressed: false,
          skipped: false,
          originalBytes: original.length,
          outputBytes: original.length,
          error: 'compression_failed',
        }),
      },
    });

    await assert.rejects(
      () => transcoder.transcode({ source: { bytes: original }, metadata: { mediaKind: 'video' } }),
      /video_processing_failed/,
    );
  });

  it('limita concorrencia por padrao para proteger CPU do worker', async () => {
    const calls = [];
    const releases = [];
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    const compressed = Buffer.alloc(900 * 1024, 2);
    const transcoder = new FfmpegVideoTranscoder({
      concurrency: 1,
      compression: {
        compress: async () => {
          calls.push(Date.now());
          await new Promise(resolve => releases.push(resolve));
          return {
            bytes: compressed,
            contentType: 'video/mp4',
            compressed: true,
            skipped: false,
            originalBytes: original.length,
            outputBytes: compressed.length,
            error: null,
          };
        },
      },
    });

    const first = transcoder.transcode({ source: { bytes: original }, metadata: { mediaKind: 'video' } });
    const second = transcoder.transcode({ source: { bytes: original }, metadata: { mediaKind: 'video' } });

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);

    releases.shift()();
    await first;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 2);

    releases.shift()();
    await second;
  });
});
