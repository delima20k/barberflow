'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const { S3CompatibleStorageGateway } = require('../../infrastructure/media/S3CompatibleStorageGateway');
const { MediaPipeline }              = require('../../application/media/MediaPipeline');
const { MimeValidationStep }         = require('../../application/media/steps/MimeValidationStep');
const { ThumbnailStep }              = require('../../application/media/steps/ThumbnailStep');
const { TranscodeStep }              = require('../../application/media/steps/TranscodeStep');
const { CDNPublishStep }             = require('../../application/media/steps/CDNPublishStep');

const hasLocalStorage = Boolean(process.env.MEDIA_S3_ENDPOINT && process.env.MEDIA_S3_ACCESS_KEY && process.env.MEDIA_S3_SECRET_KEY);

describe('Media storage integration', { skip: !hasLocalStorage }, () => {
  it('processa um arquivo real no MinIO ou LocalStack ate o prefixo CDN', async () => {
    const storage = new S3CompatibleStorageGateway({
      endpoint: process.env.MEDIA_S3_ENDPOINT,
      accessKeyId: process.env.MEDIA_S3_ACCESS_KEY,
      secretAccessKey: process.env.MEDIA_S3_SECRET_KEY,
      bucket: process.env.MEDIA_S3_BUCKET ?? 'barberflow-media-test',
      region: process.env.MEDIA_S3_REGION ?? 'us-east-1',
    });
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    const sourcePath = `incoming/integration-${Date.now()}.png`;
    await storage.putSource({ path: sourcePath, bytes, contentType: 'image/png' });

    const pipeline = new MediaPipeline([
      new MimeValidationStep(),
      new ThumbnailStep(),
      new TranscodeStep({ transcoder: { transcode: async () => [] } }),
      new CDNPublishStep({
        storage,
        mediaRepository: { markPublished: async (_id, variants) => variants },
      }),
    ]);
    const result = await pipeline.process({
      mediaId: 'integration-media',
      ownerId: 'integration-owner',
      context: 'portfolio',
      source: { bucket: storage.bucket, path: sourcePath, bytes, contentType: 'image/png', sizeBytes: bytes.length },
      variants: [],
      metadata: {},
    });

    assert.equal(result.status, 'published');
  });
});
