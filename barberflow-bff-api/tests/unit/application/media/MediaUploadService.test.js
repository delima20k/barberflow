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
});
