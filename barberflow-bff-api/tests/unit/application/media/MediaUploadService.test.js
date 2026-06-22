'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const { MediaUploadService } = require('../../../../application/media/MediaUploadService');

describe('MediaUploadService', () => {
  it('gera URL pre-assinada sem receber bytes pela API', async () => {
    const calls = [];
    const service = new MediaUploadService({
      storage: {
        createSignedUpload: async (request) => {
          calls.push(request);
          return { uploadUrl: 'https://storage.test/upload', token: 'storage-token', expiresAt: '2026-05-22T12:00:00.000Z' };
        },
      },
      mediaRepository: { reserve: async (media) => media },
      outboxRepository: { save: async () => 'outbox-1' },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
    });

    const result = await service.createSignedUpload('aaaaaaaa-0000-4000-8000-000000000001', {
      context: 'portfolio',
      contentType: 'image/png',
      sizeBytes: 1024,
      privacy: 'private',
    });

    assert.equal(result.uploadUrl, 'https://storage.test/upload');
    assert.equal(calls[0].sizeBytes, 1024);
  });

  it('gera presigned para video de story (sobe direto ao R2, sem trafegar bruto pela funcao)', async () => {
    const calls = [];
    const service = new MediaUploadService({
      storage: {
        createSignedUpload: async (request) => {
          calls.push(request);
          return { uploadUrl: 'https://storage.test/upload', token: 'storage-token', expiresAt: '2026-05-22T12:00:00.000Z' };
        },
      },
      mediaRepository: { reserve: async (media) => media },
      outboxRepository: { save: async () => 'outbox-1' },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
    });

    const result = await service.createSignedUpload('aaaaaaaa-0000-4000-8000-000000000001', {
      context: 'stories',
      contentType: 'video/mp4',
      sizeBytes: 4 * 1024 * 1024,
    });

    assert.equal(result.uploadUrl, 'https://storage.test/upload');
    assert.equal(calls[0].contentType, 'video/mp4');
  });

  it('confirma upload de story e cria variante original imediata para acesso antes do worker', async () => {
    let event = null;
    let originalVariant = null;
    const service = new MediaUploadService({
      storage: {
        createSignedUpload: async () => ({}),
        assertObjectExists: async () => ({ sizeBytes: 1024, contentType: 'image/png' }),
      },
      mediaRepository: {
        reserve: async (media) => media,
        confirmUploaded: async () => ({ id: 'media-1', path: 'stories/owner-1/incoming/media-1.png' }),
        salvarVariante: async (mediaId, variant) => { originalVariant = { mediaId, variant }; },
      },
      outboxRepository: { save: async (payload) => { event = payload; return 'outbox-1'; } },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
    });

    const result = await service.confirmUpload('aaaaaaaa-0000-4000-8000-000000000001', {
      mediaId: 'media-1',
      path: 'stories/owner-1/incoming/media-1.png',
      context: 'stories',
      confirmationToken: 'confirm-token',
    });

    assert.equal(result.status, 'queued');
    assert.equal(event.eventName, 'process_media');
    assert.deepEqual(originalVariant, {
      mediaId: 'media-1',
      variant: {
        name: 'original',
        version: 1,
        storagePath: 'stories/owner-1/incoming/media-1.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        metadata: { variantStatus: 'processing' },
      },
    });
  });

  it('permite acesso imediato ao original apos confirmar story sem expor storagePath', async () => {
    const variants = new Map();
    const OWNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
    const MEDIA_ID = 'media-immediate-1';
    const service = new MediaUploadService({
      storage: {
        assertObjectExists: async () => ({ sizeBytes: 2048, contentType: 'image/png' }),
        createSignedAccess: async ({ path, expiresInSeconds }) => ({
          signedUrl: `https://signed.test/${encodeURIComponent(path)}?exp=${expiresInSeconds}`,
        }),
      },
      mediaRepository: {
        reserve: async (media) => media,
        confirmUploaded: async (media) => ({ id: media.mediaId, path: media.path }),
        salvarVariante: async (mediaId, variant) => { variants.set(`${mediaId}:${variant.name}`, variant); },
        getOwnedVariant: async (ownerId, mediaId, name) => {
          assert.equal(ownerId, OWNER_ID);
          const variant = variants.get(`${mediaId}:${name}`);
          return variant ? { path: variant.storagePath, privacy: 'private', version: variant.version } : null;
        },
      },
      outboxRepository: { save: async () => 'outbox-1' },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
    });

    await service.confirmUpload(OWNER_ID, {
      mediaId: MEDIA_ID,
      path: 'stories/owner-1/incoming/media-immediate-1.png',
      context: 'stories',
      confirmationToken: 'confirm-token',
    });

    const access = await service.createSignedAccess(OWNER_ID, MEDIA_ID, 'original', 120);

    assert.match(access.signedUrl, /^https:\/\/signed\.test\//);
    assert.equal(Object.prototype.hasOwnProperty.call(access, 'path'), false);
  });

  it('uploadCompressedStory comprime, envia ao storage e agenda processamento', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    const compressed = Buffer.alloc(900 * 1024, 2);
    const calls = { put: null, confirmed: null, event: null, originalVariant: null };
    let compressionOptions = null;
    const service = new MediaUploadService({
      storage: {
        putVariant: async (variant) => { calls.put = variant; },
        publicUrl: (path) => `https://cdn.test/${path}`,
      },
      mediaRepository: {
        reserve: async (media) => media,
        confirmUploaded: async (media) => { calls.confirmed = media; return { id: media.mediaId, path: media.path }; },
        salvarVariante: async (mediaId, variant) => { calls.originalVariant = { mediaId, variant }; },
      },
      outboxRepository: { save: async (payload) => { calls.event = payload; return 'outbox-story-1'; } },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
      videoCompressionService: {
        compress: async (_bytes, options) => {
          compressionOptions = options;
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

    const result = await service.uploadCompressedStory('aaaaaaaa-0000-4000-8000-000000000001', {
      bytes: original,
      contentType: 'video/mp4',
      sizeBytes: original.length,
    });

    assert.equal(calls.put.bytes, compressed);
    assert.deepEqual(compressionOptions, { force: true });
    assert.equal(calls.put.contentType, 'video/mp4');
    assert.match(calls.put.path, /^stories\/aaaaaaaa-0000-4000-8000-000000000001\/incoming\/.+\.mp4$/);
    assert.equal(calls.confirmed.sizeBytes, compressed.length);
    assert.equal(calls.confirmed.metadata.videoCompression.compressed, true);
    assert.equal(calls.event.eventName, 'process_media');
    assert.equal(calls.originalVariant.mediaId, result.mediaId);
    assert.equal(calls.originalVariant.variant.name, 'original');
    assert.equal(calls.originalVariant.variant.storagePath, result.path);
    assert.equal(calls.originalVariant.variant.contentType, 'video/mp4');
    assert.equal(calls.originalVariant.variant.sizeBytes, compressed.length);
    assert.equal(result.status, 'queued');
    assert.equal(result.compression.outputBytes, compressed.length);
    assert.ok(result.publicUrl.includes(result.path));
  });

  it('uploadCompressedStory rejeita salvar original quando compressao falha', async () => {
    const original = Buffer.alloc(2 * 1024 * 1024, 1);
    let uploaded = null;
    const service = new MediaUploadService({
      storage: { putVariant: async (variant) => { uploaded = variant; } },
      mediaRepository: {
        reserve: async (media) => media,
        confirmUploaded: async (media) => ({ id: media.mediaId, path: media.path }),
      },
      outboxRepository: { save: async () => 'outbox-story-2' },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
      videoCompressionService: {
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
      () => service.uploadCompressedStory('aaaaaaaa-0000-4000-8000-000000000002', {
        bytes: original,
        contentType: 'video/mp4',
        sizeBytes: original.length,
      }),
      { status: 422 },
    );
    assert.equal(uploaded, null);
  });

  it('uploadCompressedStory rejeita conteudo que nao seja video/mp4', async () => {
    const service = new MediaUploadService({
      storage: { putVariant: async () => {} },
      mediaRepository: { reserve: async (media) => media },
      outboxRepository: { save: async () => 'outbox' },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
      videoCompressionService: { compress: async () => ({}) },
    });

    await assert.rejects(
      () => service.uploadCompressedStory('aaaaaaaa-0000-4000-8000-000000000003', {
        bytes: Buffer.alloc(1024),
        contentType: 'image/png',
        sizeBytes: 1024,
      }),
      { status: 400 },
    );
  });

  it('salvarThumb faz upload da thumbnail e salva variante no repositorio', async () => {
    const OWNER_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
    const MEDIA_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

    let varianteSalva = null;
    let putVariantChamado = false;

    // Gera buffer JPEG mínimo válido (2 bytes > 100)
    const thumbBuffer = Buffer.alloc(200, 0xff);
    const thumbBase64 = thumbBuffer.toString('base64');

    const service = new MediaUploadService({
      storage: {
        createSignedUpload: async () => ({}),
        assertObjectExists: async () => ({ sizeBytes: 0, contentType: 'image/jpeg' }),
        putVariant: async (variant) => { putVariantChamado = true; return variant; },
      },
      mediaRepository: {
        reserve: async (m) => m,
        confirmUploaded: async () => ({ id: MEDIA_ID, path: 'stories/x/incoming/v.mp4' }),
        getForProcessing: async () => ({ id: MEDIA_ID, owner_id: OWNER_ID, contexto: 'stories' }),
        salvarVariante: async (mediaId, variant) => { varianteSalva = { mediaId, variant }; },
      },
      outboxRepository: { save: async () => 'outbox-1' },
      confirmationSigner: { sign: () => 'tok', verify: () => true },
    });

    const result = await service.salvarThumb(OWNER_ID, MEDIA_ID, thumbBase64);

    assert.ok(putVariantChamado, 'deve chamar storage.putVariant');
    assert.ok(varianteSalva, 'deve chamar mediaRepository.salvarVariante');
    assert.equal(varianteSalva.mediaId, MEDIA_ID);
    assert.equal(varianteSalva.variant.name, 'thumb');
    assert.equal(varianteSalva.variant.contentType, 'image/jpeg');
    assert.ok(result.path.includes(MEDIA_ID), 'path deve conter mediaId');
  });

  it('salvarThumb rejeita base64 vazia', async () => {
    const service = new MediaUploadService({
      storage: { createSignedUpload: async () => ({}) },
      mediaRepository: { reserve: async (m) => m },
      outboxRepository: { save: async () => 'x' },
      confirmationSigner: { sign: () => 'tok', verify: () => true },
    });

    await assert.rejects(
      () => service.salvarThumb('aaaaaaaa-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', ''),
      { status: 400 },
    );
  });
});
