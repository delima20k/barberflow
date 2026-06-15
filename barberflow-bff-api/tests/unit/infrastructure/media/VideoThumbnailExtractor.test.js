'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os     = require('node:os');
const fs     = require('node:fs');
const path   = require('node:path');

const { VideoThumbnailExtractor } = require('../../../../infrastructure/media/VideoThumbnailExtractor');

const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // cabeçalho JPEG mínimo

describe('VideoThumbnailExtractor', () => {
  it('retorna Buffer JPEG quando ffmpeg extrai frame com sucesso', async () => {
    const runFfmpeg = async (_inPath, outPath) => {
      await fs.promises.writeFile(outPath, FAKE_JPEG);
    };
    const extractor = new VideoThumbnailExtractor({ runFfmpeg });

    const result = await extractor.extract(Buffer.from('fake-mp4-bytes'));

    assert.ok(result instanceof Buffer, 'deve retornar Buffer');
    assert.deepStrictEqual(result, FAKE_JPEG);
  });

  it('retorna null quando ffmpeg falha (degradação graciosa)', async () => {
    const runFfmpeg = async () => {
      throw new Error('ffmpeg: codec error');
    };
    const extractor = new VideoThumbnailExtractor({ runFfmpeg });

    const result = await extractor.extract(Buffer.from('bad-video'));

    assert.strictEqual(result, null);
  });

  it('apaga arquivos temporários após extração bem-sucedida', async () => {
    let capturedIn  = null;
    let capturedOut = null;

    const runFfmpeg = async (inPath, outPath) => {
      capturedIn  = inPath;
      capturedOut = outPath;
      await fs.promises.writeFile(outPath, FAKE_JPEG);
    };
    const extractor = new VideoThumbnailExtractor({ runFfmpeg });

    await extractor.extract(Buffer.from('mp4'));

    // Aguarda microtask de unlink (fire-and-forget no finally)
    await new Promise(r => setTimeout(r, 50));

    assert.ok(capturedIn  && !fs.existsSync(capturedIn),  'arquivo de entrada deve ser apagado');
    assert.ok(capturedOut && !fs.existsSync(capturedOut), 'arquivo de saída deve ser apagado');
  });

  it('apaga arquivos temporários mesmo quando ffmpeg falha', async () => {
    let capturedIn = null;

    const runFfmpeg = async (inPath) => {
      capturedIn = inPath;
      throw new Error('falha');
    };
    const extractor = new VideoThumbnailExtractor({ runFfmpeg });

    await extractor.extract(Buffer.from('mp4'));

    await new Promise(r => setTimeout(r, 50));

    assert.ok(capturedIn && !fs.existsSync(capturedIn), 'arquivo de entrada deve ser apagado mesmo em erro');
  });

  it('usa diretório temp do sistema operacional para arquivos intermediários', async () => {
    let capturedIn = null;

    const runFfmpeg = async (inPath, outPath) => {
      capturedIn = inPath;
      await fs.promises.writeFile(outPath, FAKE_JPEG);
    };
    const extractor = new VideoThumbnailExtractor({ runFfmpeg });

    await extractor.extract(Buffer.from('mp4'));

    assert.ok(capturedIn.startsWith(os.tmpdir()), 'deve usar tmpdir do sistema');
  });

  it('arquivos de sessões diferentes não colidem (UUIDs únicos)', async () => {
    const paths = [];

    const runFfmpeg = async (inPath, outPath) => {
      paths.push(inPath);
      await fs.promises.writeFile(outPath, FAKE_JPEG);
    };
    const extractor = new VideoThumbnailExtractor({ runFfmpeg });

    await Promise.all([
      extractor.extract(Buffer.from('v1')),
      extractor.extract(Buffer.from('v2')),
    ]);

    assert.strictEqual(paths.length, 2);
    assert.notStrictEqual(paths[0], paths[1], 'paths devem ser únicos por chamada');
  });
});
