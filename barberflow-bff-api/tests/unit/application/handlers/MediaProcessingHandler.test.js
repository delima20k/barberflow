'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                       = require('node:assert/strict');
const { MediaProcessingHandler }   = require('../../../../application/handlers/MediaProcessingHandler');
const { Job }                      = require('../../../../application/shared/Job');
const { QUEUES, JOB_TYPES }        = require('../../../../config/queues');

function makeJob(payload = {}) {
  return Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload }).getValue();
}

describe('MediaProcessingHandler', () => {
  it('lança TypeError se imageProcessor ausente', () => {
    assert.throws(
      () => new MediaProcessingHandler({ imageProcessor: null, mediaRepository: {} }),
      /imageProcessor/,
    );
  });

  it('lança TypeError se mediaRepository ausente', () => {
    assert.throws(
      () => new MediaProcessingHandler({ imageProcessor: {}, mediaRepository: null }),
      /mediaRepository/,
    );
  });

  it('jobType é process_media', () => {
    const h = new MediaProcessingHandler({ imageProcessor: {}, mediaRepository: {} });
    assert.equal(h.jobType, JOB_TYPES.PROCESS_MEDIA);
  });

  it('handle delega a imageProcessor e mediaRepository', async () => {
    let processArgs = null;
    let saveArgs    = null;

    const imageProcessor  = { process: async (fileId, tipo, ct) => { processArgs = [fileId, tipo, ct]; return { data: Buffer.from('ok'), format: 'webp' }; } };
    const mediaRepository = { save: async (fileId, result, ownerId) => { saveArgs = [fileId, result, ownerId]; } };

    const handler = new MediaProcessingHandler({ imageProcessor, mediaRepository });
    const job = makeJob({ fileId: 'file-123', ownerId: 'owner-456', tipo: 'logo', contentType: 'image/jpeg' });

    await handler.handle(job);

    assert.deepEqual(processArgs, ['file-123', 'logo', 'image/jpeg']);
    assert.equal(saveArgs[0], 'file-123');
    assert.equal(saveArgs[2], 'owner-456');
  });

  it('handle lança erro se fileId ausente', async () => {
    const handler = new MediaProcessingHandler({
      imageProcessor: { process: async () => ({}) },
      mediaRepository: { save: async () => {} },
    });
    const job = makeJob({ ownerId: 'o1', tipo: 'logo' }); // fileId ausente
    await assert.rejects(() => handler.handle(job), /fileId/);
  });

  it('handle lança erro se ownerId ausente', async () => {
    const handler = new MediaProcessingHandler({
      imageProcessor: { process: async () => ({}) },
      mediaRepository: { save: async () => {} },
    });
    const job = makeJob({ fileId: 'f1', tipo: 'logo' }); // ownerId ausente
    await assert.rejects(() => handler.handle(job), /ownerId/);
  });

  it('propagaa erro do imageProcessor', async () => {
    const imageProcessor  = { process: async () => { throw new Error('sharp falhou'); } };
    const mediaRepository = { save: async () => {} };
    const handler = new MediaProcessingHandler({ imageProcessor, mediaRepository });
    const job = makeJob({ fileId: 'f1', ownerId: 'o1', tipo: 'logo' });
    await assert.rejects(() => handler.handle(job), /sharp falhou/);
  });
});
