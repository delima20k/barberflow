'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const { VideoCompressionService } = require('../../../../infrastructure/media/VideoCompressionService');

const silentLogger = { warn: () => {} };

describe('VideoCompressionService', () => {
  it('comprime video valido usando runner injetado', async () => {
    // Precisa ficar acima de SKIP_BELOW_BYTES (3.5MB) pra shouldSkip() nao pular
    // a compressao antes do runner ser chamado.
    const original = Buffer.alloc(4 * 1024 * 1024, 1);
    const compressed = Buffer.alloc(Math.floor(1.35 * 1024 * 1024), 2);
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
    // Runner injetado não tem acesso a um arquivo real em disco pra sondar
    // duração — cai no fallback conservador de 30s (mesmo teto do
    // StoryComposer no cliente). CRF governa a qualidade de verdade; o
    // bitrate calculado por #calcularBitrateVideoBps(null) com
    // TARGET_BYTES=3.3MB (782472bps) agora só vira o TETO de segurança
    // (maxrate/bufsize), não mais um alvo fixo de bitrate. maxrate tem
    // headroom real acima da média (2x, não mais "+20k" herdado do CBR) e
    // bufsize dá mais segundos de colchão ao rate-control (3x maxrate, não
    // mais 2x) — evita o teto estourar de forma abrupta em cena complexa.
    assert.equal(runnerOptions.crf, 23);
    assert.equal(runnerOptions.audioBitrate, '48k');
    assert.equal(runnerOptions.maxrate, '1565k'); // bitrate calculado (item 2) x2
    assert.equal(runnerOptions.bufsize, '4695k'); // 3x maxrate
    assert.equal(runnerOptions.rateControl, 'crf');
    assert.equal(runnerOptions.width, 480);
    assert.equal(runnerOptions.fps, 24);
    assert.equal(runnerOptions.preset, 'fast');
    assert.equal(runnerOptions.targetBytes, Math.floor(3.3 * 1024 * 1024));
    assert.equal(runnerOptions.maxOutputBytes, VideoCompressionService.MAX_OUTPUT_BYTES);
    assert.equal(VideoCompressionService.MAX_OUTPUT_BYTES, Math.floor(4 * 1024 * 1024));
  });

  it('usa original como fallback quando video esta corrompido', async () => {
    // Idem — acima de SKIP_BELOW_BYTES (3.5MB), senao o runner nunca seria
    // chamado e o erro simulado nunca aconteceria.
    const original = Buffer.alloc(4 * 1024 * 1024, 1);
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
    const original = Buffer.alloc(1200 * 1024, 1);
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

  it('aceita recompressao forcada maior que o original quando fica dentro de 1.5MB', async () => {
    const original = Buffer.alloc(813 * 1024, 1);
    const recompressed = Buffer.alloc(Math.floor(1.35 * 1024 * 1024), 2);
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

  it('marca erro quando a compressao ainda fica acima de 1.5MB', async () => {
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
