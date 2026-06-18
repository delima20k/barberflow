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

  it('confirma upload e agenda processamento na fila de midia', async () => {
    let event = null;
    const service = new MediaUploadService({
      storage: {
        createSignedUpload: async () => ({}),
        assertObjectExists: async () => ({ sizeBytes: 1024, contentType: 'image/png' }),
      },
      mediaRepository: {
        reserve: async (media) => media,
        confirmUploaded: async () => ({ id: 'media-1', path: 'incoming/media-1.png' }),
      },
      outboxRepository: { save: async (payload) => { event = payload; return 'outbox-1'; } },
      confirmationSigner: { sign: () => 'confirm-token', verify: () => true },
    });

    const result = await service.confirmUpload('aaaaaaaa-0000-4000-8000-000000000001', {
      mediaId: 'media-1',
      path: 'incoming/media-1.png',
      context: 'portfolio',
      confirmationToken: 'confirm-token',
    });

    assert.equal(result.status, 'queued');
    assert.equal(event.eventName, 'process_media');
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
