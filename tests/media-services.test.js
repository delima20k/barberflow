'use strict';

process.env.MEDIA_SIGNING_SECRET = 'test-signing-secret-must-be-32c!';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');

const MediaValidator = require('../src/media/MediaValidator');
const MediaUploadService = require('../src/media/MediaUploadService');
const {
  ImageCompressionService,
  PhotoCompressionStrategy,
  ScreenshotCompressionStrategy,
  AnimatedImageStrategy,
} = require('../src/media/ImageCompressionService');
const VideoProcessor = require('../src/media/VideoProcessor');
const MediaPreviewRenderer = require('../src/media/MediaPreviewRenderer');
const StoryMediaAdapter = require('../src/media/StoryMediaAdapter');
const PortfolioMediaAdapter = require('../src/media/PortfolioMediaAdapter');
const { UploadError, ValidationError } = require('../src/media/MediaErrors');

const UUID_OWNER = '00000000-0000-4000-8000-000000000001';

async function criarPng(width = 320, height = 240) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 70, b: 30 } },
  }).png().toBuffer();
}

function criarGifAnimadoFake() {
  return Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xF9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00!\xF9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'latin1');
}

function criarStorageMock() {
  const files = new Map();
  return {
    presignedPut: async (contexto, path) => `https://storage.test/${contexto}/${path}`,
    publicUrl: (contexto, path) => `https://cdn.test/${contexto}/${path}`,
    backendPara: (contexto) => contexto === 'stories' ? 'r2' : 'supabase',
    head: async (_contexto, path) => files.get(path) ?? null,
    delete: async (_contexto, path) => { files.delete(path); },
    seed: (path, info) => files.set(path, info),
    has: (path) => files.has(path),
  };
}

function criarSupabaseMock() {
  const rows = [];
  return {
    from: () => {
      let payload = null;
      const b = {
        insert: (p) => { payload = p; return b; },
        select: () => b,
        single: async () => {
          const id = crypto.randomUUID();
          rows.push({ id, ...payload });
          return { data: { id }, error: null };
        },
      };
      return b;
    },
    rows,
  };
}

describe('MediaValidator', () => {
  it('deve aceitar imagem valida para portfolio', () => {
    const validator = new MediaValidator();
    const cfg = validator.validateUploadRequest({
      contexto: 'portfolio',
      ownerId: UUID_OWNER,
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    assert.equal(cfg.maxBytes, 10 * 1024 * 1024);
  });

  it('deve rejeitar video em avatars', () => {
    const validator = new MediaValidator();
    assert.throws(
      () => validator.validateUploadRequest({ contexto: 'avatars', ownerId: UUID_OWNER, contentType: 'video/mp4' }),
      ValidationError,
    );
  });

  it('deve detectar GIF animado e magic bytes de WebP', () => {
    const validator = new MediaValidator();
    assert.equal(validator.isAnimatedImage(criarGifAnimadoFake()), true);
    assert.equal(validator.detectMagicMime(Buffer.from('RIFFxxxxWEBPyyyy', 'latin1')), 'image/webp');
  });
});

describe('ImageCompressionService', () => {
  it('deve comprimir foto com PhotoCompressionStrategy', async () => {
    const service = new ImageCompressionService({ strategies: { photo: new PhotoCompressionStrategy() } });
    const result = await service.compress(await criarPng(), { contentType: 'image/png', strategy: 'photo' });
    assert.equal(result.contentType, 'image/webp');
    assert.ok(result.bytes > 0);
  });

  it('deve preservar legibilidade em screenshot com strategy propria', async () => {
    const service = new ImageCompressionService({ strategies: { screenshot: new ScreenshotCompressionStrategy() } });
    const result = await service.compress(await criarPng(500, 160), {
      contentType: 'image/png',
      metadata: { source: 'screenshot' },
    });
    assert.ok(['image/png', 'image/webp'].includes(result.contentType));
  });

  it('deve preservar animacao em GIF animado', async () => {
    const service = new ImageCompressionService({ strategies: { animated: new AnimatedImageStrategy() } });
    const input = criarGifAnimadoFake();
    const result = await service.compress(input, { contentType: 'image/gif' });
    assert.equal(result.animated, true);
    assert.deepEqual(result.data, input);
  });

  it('deve cancelar compressao cooperativamente', async () => {
    const controller = new AbortController();
    controller.abort();
    const service = new ImageCompressionService();
    const input = await criarPng();
    await assert.rejects(
      () => service.compress(input, { contentType: 'image/png', signal: controller.signal }),
      /cancelada/,
    );
  });

  it('deve gerar presets globais THUMB, MEDIUM e FULL com metadados', async () => {
    const service = new ImageCompressionService();
    const result = await service.compressVariants(await criarPng(1800, 1200), {
      contentType: 'image/png',
    });

    assert.deepEqual(result.variants.map((variant) => variant.name), ['thumb', 'medium', 'full']);
    assert.equal(result.variants[0].contentType, 'image/webp');
    assert.ok(result.variants[0].width <= 300);
    assert.ok(result.variants[1].width <= 900);
    assert.ok(result.variants[2].width <= 1600);
    assert.ok(result.blurPlaceholder.startsWith('data:image/webp;base64,'));
  });
});

describe('VideoProcessor', () => {
  it('deve validar duracao e extrair thumbnail via dependencia injetada', async () => {
    const processor = new VideoProcessor({
      probe: { inspect: async () => ({ durationSeconds: 12, width: 720, height: 1280 }) },
      thumbnailExtractor: { extract: async () => ({ data: Buffer.from('jpg'), contentType: 'image/jpeg', bytes: 3 }) },
    });
    const info = await processor.inspect(Buffer.from('video'), { contexto: 'stories' });
    const thumb = await processor.extractThumbnail(Buffer.from('video'), { contexto: 'stories' });
    assert.equal(info.durationSeconds, 12);
    assert.equal(thumb.bytes, 3);
  });

  it('deve rejeitar story longo demais', async () => {
    const processor = new VideoProcessor({ probe: { inspect: async () => ({ durationSeconds: 61 }) } });
    await assert.rejects(
      () => processor.inspect(Buffer.from('video'), { contexto: 'stories' }),
      ValidationError,
    );
  });

  it('deve retornar TODO quando nao ha worker de transcode', async () => {
    const processor = new VideoProcessor();
    const result = await processor.enqueueTranscode({ mediaId: 'm1' });
    assert.equal(result.queued, false);
  });
});

describe('MediaUploadService', () => {
  it('deve gerar presigned e confirmar upload preservando progresso/eventos', async () => {
    const storage = criarStorageMock();
    const supabase = criarSupabaseMock();
    const events = [];
    const service = new MediaUploadService({ storage, supabase, eventBus: { emit: (name, payload) => events.push({ name, payload }) } });
    const presigned = await service.gerarUrlPresigned({ contexto: 'portfolio', ownerId: UUID_OWNER, contentType: 'image/jpeg' });
    storage.seed(presigned.path, { tamanhoBytes: 2048, contentType: 'image/jpeg' });
    const confirmed = await service.confirmarUpload({ ...presigned, contexto: 'portfolio', ownerId: UUID_OWNER });
    assert.ok(confirmed.id);
    assert.equal(events.at(-1).name, 'upload-completed');
  });

  it('deve aceitar HEAD application/octet-stream quando extensao do path e valida', async () => {
    const storage = criarStorageMock();
    const supabase = criarSupabaseMock();
    const service = new MediaUploadService({ storage, supabase });
    const presigned = await service.gerarUrlPresigned({ contexto: 'stories', ownerId: UUID_OWNER, contentType: 'video/mp4' });
    storage.seed(presigned.path, { tamanhoBytes: 512, contentType: 'application/octet-stream' });
    const confirmed = await service.confirmarUpload({ ...presigned, contexto: 'stories', ownerId: UUID_OWNER });
    assert.ok(confirmed.id);
  });

  it('deve fazer retry e emitir progresso no upload direto', async () => {
    let calls = 0;
    const progress = [];
    const service = new MediaUploadService({ storage: criarStorageMock(), retries: 1 });
    const result = await service.uploadDirect({
      uploadUrl: 'https://upload.test/file',
      body: Buffer.from('abc'),
      contentType: 'text/plain',
      onProgress: (p) => progress.push(p.loaded),
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 };
      },
    });
    assert.equal(result.attempts, 2);
    assert.deepEqual(progress, [0, 0, 3]);
  });

  it('deve abortar upload direto antes de enviar', async () => {
    const controller = new AbortController();
    controller.abort();
    const service = new MediaUploadService({ storage: criarStorageMock() });
    await assert.rejects(
      () => service.uploadDirect({ uploadUrl: 'https://upload.test/file', body: Buffer.from('abc'), signal: controller.signal, fetchImpl: async () => ({ ok: true }) }),
      UploadError,
    );
  });
});

describe('MediaPreviewRenderer', () => {
  it('deve renderizar preview e revogar Blob URL', () => {
    const revoked = [];
    const renderer = new MediaPreviewRenderer({
      urlApi: {
        createObjectURL: () => 'blob://media-1',
        revokeObjectURL: (url) => revoked.push(url),
      },
    });
    const target = { dataset: {}, src: '', alt: '' };
    const preview = renderer.render(target, { file: Buffer.from('x'), kind: 'image', alt: 'preview' });
    preview.revoke();
    assert.equal(target.src, 'blob://media-1');
    assert.deepEqual(revoked, ['blob://media-1']);
  });
});

describe('StoryMediaAdapter e PortfolioMediaAdapter', () => {
  it('deve preparar upload de foto para StoryMediaAdapter', async () => {
    const adapter = new StoryMediaAdapter({
      imageCompression: new ImageCompressionService(),
      videoProcessor: new VideoProcessor(),
      uploadService: {
        upload: async ({ buffer, contexto, contentType }) => ({
          id: 'story-media-id',
          path: `${contexto}/${UUID_OWNER}/story.webp`,
          publicUrl: 'https://cdn/story.webp',
          tamanhoBytes: buffer.length,
          contentType,
        }),
      },
    });
    const result = await adapter.prepare({
      buffer: await criarPng(),
      ownerId: UUID_OWNER,
      barbershopId: 'shop-1',
      contentType: 'image/png',
      caption: 'corte novo',
    });
    assert.equal(result.contexto, 'stories');
    assert.equal(result.mediaId, 'story-media-id');
  });

  it('deve preparar upload de foto para PortfolioMediaAdapter', async () => {
    const adapter = new PortfolioMediaAdapter({
      imageCompression: new ImageCompressionService(),
      uploadService: {
        upload: async ({ buffer, contexto, contentType }) => ({
          id: 'portfolio-media-id',
          path: `${contexto}/${UUID_OWNER}/portfolio.webp`,
          publicUrl: 'https://cdn/portfolio.webp',
          tamanhoBytes: buffer.length,
          contentType,
        }),
      },
    });
    const result = await adapter.prepare({
      buffer: await criarPng(900, 1200),
      ownerId: UUID_OWNER,
      barbershopId: 'shop-1',
      contentType: 'image/jpeg',
      title: 'degrade',
    });
    assert.equal(result.contexto, 'portfolio');
    assert.equal(result.mediaId, 'portfolio-media-id');
  });

  it('deve rejeitar entrada invalida e video curto no portfolio', async () => {
    const adapter = new PortfolioMediaAdapter({
      imageCompression: new ImageCompressionService(),
      uploadService: { upload: async () => ({ id: 'x' }) },
    });
    await assert.rejects(
      () => adapter.prepare({ buffer: Buffer.from('video'), ownerId: UUID_OWNER, contentType: 'video/mp4' }),
      ValidationError,
    );
  });

  it('deve aceitar video curto no StoryMediaAdapter', async () => {
    const adapter = new StoryMediaAdapter({
      imageCompression: new ImageCompressionService(),
      videoProcessor: new VideoProcessor({
        probe: { inspect: async () => ({ durationSeconds: 8 }) },
        thumbnailExtractor: { extract: async () => ({ data: Buffer.from('jpg'), contentType: 'image/jpeg', bytes: 3 }) },
      }),
      uploadService: { upload: async () => ({ id: 'video-story-id', path: 'stories/video.mp4', publicUrl: 'https://cdn/video.mp4' }) },
    });
    const result = await adapter.prepare({ buffer: Buffer.from('video'), ownerId: UUID_OWNER, contentType: 'video/mp4' });
    assert.equal(result.kind, 'video');
  });
});
