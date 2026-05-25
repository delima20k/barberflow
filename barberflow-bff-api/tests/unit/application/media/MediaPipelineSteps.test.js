'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const sharp            = require('sharp');

const { VirusScanStep }        = require('../../../../application/media/steps/VirusScanStep');
const { MimeValidationStep }   = require('../../../../application/media/steps/MimeValidationStep');
const { MetadataExtractStep }  = require('../../../../application/media/steps/MetadataExtractStep');
const { ThumbnailStep }        = require('../../../../application/media/steps/ThumbnailStep');
const { TranscodeStep }        = require('../../../../application/media/steps/TranscodeStep');
const { CDNPublishStep }       = require('../../../../application/media/steps/CDNPublishStep');
const { MediaPipelineMetrics } = require('../../../../application/media/MediaPipelineMetrics');

async function pngBuffer() {
  return sharp({
    create: {
      width: 6,
      height: 4,
      channels: 3,
      background: { r: 212, g: 175, b: 55 },
    },
  }).png().toBuffer();
}

function makeInput(buffer, overrides = {}) {
  return {
    mediaId: 'media-1',
    ownerId: 'owner-1',
    context: 'portfolio',
    source: {
      bucket: 'media-private',
      path: 'incoming/owner-1/media-1.png',
      bytes: buffer,
      contentType: 'image/png',
      sizeBytes: buffer.length,
    },
    variants: [],
    metadata: {},
    ...overrides,
  };
}

describe('VirusScanStep', () => {
  it('marca a midia como limpa quando o scanner aprova', async () => {
    const buffer = await pngBuffer();
    const step = new VirusScanStep({ scanner: { scan: async () => ({ infected: false }) } });

    const result = await step.handle(makeInput(buffer));

    assert.equal(result.metadata.virusScan.status, 'clean');
  });

  it('rejeita midia infectada', async () => {
    const buffer = await pngBuffer();
    const step = new VirusScanStep({ scanner: { scan: async () => ({ infected: true, signature: 'EICAR' }) } });

    await assert.rejects(() => step.handle(makeInput(buffer)), /VirusScanStep: arquivo bloqueado/);
  });
});

describe('MimeValidationStep', () => {
  it('valida assinatura real do arquivo e limite configurado', async () => {
    const buffer = await pngBuffer();
    const step = new MimeValidationStep();

    const result = await step.handle(makeInput(buffer));

    assert.equal(result.metadata.mediaKind, 'image');
  });

  it('rejeita content type declarado que nao bate com a assinatura', async () => {
    const buffer = await pngBuffer();
    const step = new MimeValidationStep();

    await assert.rejects(
      () => step.handle(makeInput(buffer, { source: { ...makeInput(buffer).source, contentType: 'video/mp4' } })),
      /MimeValidationStep: MIME real nao confere/,
    );
  });
});

describe('MetadataExtractStep', () => {
  it('extrai dimensoes e pHash para imagem', async () => {
    const buffer = await pngBuffer();
    const step = new MetadataExtractStep({ duplicateFinder: { findByPerceptualHash: async () => null } });

    const result = await step.handle(makeInput(buffer, { metadata: { mediaKind: 'image' } }));

    assert.equal(result.metadata.width, 6);
    assert.match(result.metadata.perceptualHash, /^[0-9a-f]{16}$/);
  });

  it('marca duplicata perceptual para anti-spam', async () => {
    const buffer = await pngBuffer();
    const step = new MetadataExtractStep({
      duplicateFinder: { findByPerceptualHash: async () => ({ id: 'media-original' }) },
    });

    const result = await step.handle(makeInput(buffer, { metadata: { mediaKind: 'image' } }));

    assert.equal(result.metadata.duplicateOf, 'media-original');
  });
});

describe('ThumbnailStep', () => {
  it('gera presets globais thumb, medium e full versionados para imagem', async () => {
    const buffer = await pngBuffer();
    const step = new ThumbnailStep();

    const result = await step.handle(makeInput(buffer, { metadata: { mediaKind: 'image' } }));

    assert.deepEqual(result.variants.map((variant) => variant.name), ['thumb', 'medium', 'full']);
    assert.match(result.variants[0].path, /\/thumb\/v1\//);
    assert.equal(result.variants[0].contentType, 'image/webp');
    assert.ok(result.variants[0].width <= 300);
    assert.ok(result.variants[1].width <= 900);
    assert.ok(result.variants[2].width <= 1600);
    assert.equal(result.variants[0].metadata.mimeType, 'image/webp');
  });
});

describe('TranscodeStep', () => {
  it('preserva variante original versionada para imagem', async () => {
    const buffer = await pngBuffer();
    const step = new TranscodeStep({ transcoder: { transcode: async () => [] } });

    const result = await step.handle(makeInput(buffer, { metadata: { mediaKind: 'image' } }));

    assert.equal(result.variants[0].name, 'original');
  });

  it('delega variantes de video ao transcoder', async () => {
    const buffer = Buffer.from('video');
    const step = new TranscodeStep({
      transcoder: {
        transcode: async () => [{ name: 'video_480p', contentType: 'video/mp4', bytes: buffer }],
      },
    });

    const result = await step.handle(makeInput(buffer, { metadata: { mediaKind: 'video' } }));

    assert.deepEqual(result.variants.map((variant) => variant.name), ['original', 'video_480p']);
  });
});

describe('CDNPublishStep', () => {
  it('publica variantes, persiste catalogo e registra metricas', async () => {
    const buffer = await pngBuffer();
    const uploads = [];
    const metrics = new MediaPipelineMetrics();
    const step = new CDNPublishStep({
      storage: { putVariant: async (variant) => uploads.push(variant.path) },
      mediaRepository: { markPublished: async (_mediaId, variants) => variants },
      metrics,
    });

    const result = await step.handle(makeInput(buffer, {
      variants: [{ name: 'thumb_sm', version: 1, path: 'portfolio/media-1/thumb_sm/v1/thumb.webp', bytes: buffer, contentType: 'image/webp' }],
    }));

    assert.equal(result.status, 'published');
    assert.deepEqual(uploads, ['portfolio/media-1/thumb_sm/v1/thumb.webp']);
  });
});
