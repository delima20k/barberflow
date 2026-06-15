'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { VideoThumbnailStep } = require('../../../../application/media/steps/VideoThumbnailStep');

const THUMB_BYTES  = Buffer.from('thumb-webp');
const MEDIUM_BYTES = Buffer.from('medium-webp');

const mockExtractor = (bytes) => ({
  extract: async () => bytes,
});

const mockCompression = {
  compressVariants: async () => ({
    variants: [
      { name: 'thumb',  data: THUMB_BYTES,  contentType: 'image/webp', version: 1, width: 300,  height: 480,  sizeBytes: THUMB_BYTES.length,  metadata: {} },
      { name: 'medium', data: MEDIUM_BYTES, contentType: 'image/webp', version: 1, width: 900,  height: 1440, sizeBytes: MEDIUM_BYTES.length, metadata: {} },
    ],
  }),
};

function makeVideoInput(overrides = {}) {
  return {
    mediaId: 'media-abc',
    ownerId: 'owner-xyz',
    context: 'stories',
    source: {
      bytes:       Buffer.from('mp4-bytes'),
      contentType: 'video/mp4',
    },
    variants: [],
    metadata: { mediaKind: 'video' },
    ...overrides,
  };
}

describe('VideoThumbnailStep', () => {
  it('adiciona variantes thumb e medium para input de vídeo', async () => {
    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(Buffer.from('jpeg')),
      compression: mockCompression,
    });

    const result = await step.handle(makeVideoInput());

    assert.strictEqual(result.variants.length, 2, 'deve gerar 2 variantes');
    const names = result.variants.map(v => v.name);
    assert.ok(names.includes('thumb'),  'deve incluir variante thumb');
    assert.ok(names.includes('medium'), 'deve incluir variante medium');
  });

  it('produz paths no formato correto (context/mediaId/name/vN/mediaId.webp)', async () => {
    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(Buffer.from('jpeg')),
      compression: mockCompression,
    });

    const result = await step.handle(makeVideoInput());

    const thumb = result.variants.find(v => v.name === 'thumb');
    assert.strictEqual(thumb.path, 'stories/media-abc/thumb/v1/media-abc.webp');
  });

  it('não altera o input quando mediaKind for "image"', async () => {
    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(Buffer.from('jpeg')),
      compression: mockCompression,
    });
    const input = makeVideoInput({ metadata: { mediaKind: 'image' } });

    const result = await step.handle(input);

    assert.strictEqual(result, input, 'deve retornar o mesmo objeto de referência');
    assert.strictEqual(result.variants.length, 0, 'não deve adicionar variantes');
  });

  it('retorna input inalterado quando extractor não consegue extrair frame', async () => {
    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(null),
      compression: mockCompression,
    });

    const result = await step.handle(makeVideoInput());

    assert.strictEqual(result.variants.length, 0, 'não deve adicionar variantes sem frame');
  });

  it('preserva variantes pré-existentes do pipeline (ex: original do TranscodeStep)', async () => {
    const originalVariant = { name: 'original', bytes: Buffer.from('mp4'), contentType: 'video/mp4' };
    const input = makeVideoInput({ variants: [originalVariant] });

    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(Buffer.from('jpeg')),
      compression: mockCompression,
    });

    const result = await step.handle(input);

    assert.strictEqual(result.variants.length, 3, 'deve ter original + thumb + medium');
    assert.strictEqual(result.variants[0].name, 'original');
  });

  it('preserva todos os campos do input além das variantes', async () => {
    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(Buffer.from('jpeg')),
      compression: mockCompression,
    });
    const input = makeVideoInput();

    const result = await step.handle(input);

    assert.strictEqual(result.mediaId, input.mediaId);
    assert.strictEqual(result.ownerId, input.ownerId);
    assert.strictEqual(result.context, input.context);
    assert.deepStrictEqual(result.source, input.source);
  });

  it('bytes da variante thumb correspondem ao retorno da compressão', async () => {
    const step = new VideoThumbnailStep({
      extractor:   mockExtractor(Buffer.from('jpeg')),
      compression: mockCompression,
    });

    const result = await step.handle(makeVideoInput());

    const thumb = result.variants.find(v => v.name === 'thumb');
    assert.deepStrictEqual(thumb.bytes, THUMB_BYTES);
  });
});
