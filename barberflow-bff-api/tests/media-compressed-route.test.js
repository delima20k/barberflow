'use strict';

const express = require('express');
const http = require('node:http');
const { suite, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_ENV = 'test';

const AuthMiddleware = require('../middlewares/auth');
const criarMediaRoute = require('../routes/media');

const OWNER_ID = '550e8400-e29b-41d4-a716-446655440000';

function request(server, method, path, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: {
          ...(body ? { 'Content-Length': body.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed = raw;
          try { parsed = JSON.parse(raw); } catch { /* resposta nao-json */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function startServer(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}

function createDbStub() {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    is: () => chain,
    lt: () => chain,
    lte: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve) => resolve({ data: [], error: null }),
  };
  return {
    from: () => chain,
    rpc: () => chain,
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({ data: { signedUrl: 'https://storage.test/upload' }, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.test/read' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/public' } }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };
}

suite('media route - uploadCompressedStory', () => {
  const originalAuth = AuthMiddleware.verificar;
  const originalBackend = process.env.STORIES_STORAGE_BACKEND;

  beforeEach(() => {
    delete process.env.STORIES_STORAGE_BACKEND;
    AuthMiddleware.verificar = (req, _res, next) => {
      req.user = { id: OWNER_ID, email: 'test@barberflow.com' };
      next();
    };
  });

  afterEach(() => {
    AuthMiddleware.verificar = originalAuth;
    if (originalBackend == null) {
      delete process.env.STORIES_STORAGE_BACKEND;
    } else {
      process.env.STORIES_STORAGE_BACKEND = originalBackend;
    }
  });

  test('usa R2 dedicado no upload comprimido mesmo sem flag global r2', async () => {
    const original = Buffer.alloc(512, 1);
    const compressed = Buffer.alloc(128, 2);
    let r2Upload = null;
    let fallbackUploadCalled = false;

    const app = express();
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), {
      storage: {
        putVariant: async () => { fallbackUploadCalled = true; },
      },
      r2Instance: {
        putVariant: async (variant) => { r2Upload = variant; },
        publicUrl: path => `https://r2.test/${path}`,
      },
      mediaRepository: {
        reserve: async media => media,
        confirmUploaded: async media => ({ id: media.mediaId, path: media.path }),
      },
      outboxRepository: { save: async () => 'outbox-1' },
      confirmationSigner: { sign: () => 'token', verify: () => true },
      videoCompressionService: {
        compress: async () => ({
          bytes: compressed,
          contentType: 'video/mp4',
          compressed: true,
          skipped: false,
          originalBytes: original.length,
          outputBytes: compressed.length,
          error: null,
        }),
      },
    }));

    const server = await startServer(app);
    try {
      const response = await request(server, 'POST', '/api/v1/media/stories/upload-compressed', {
        body: original,
        headers: {
          'Content-Type': 'video/mp4',
          Authorization: 'Bearer test',
        },
      });

      assert.equal(response.status, 201);
      assert.equal(fallbackUploadCalled, false);
      assert.ok(r2Upload, 'deve fazer upload no R2 dedicado');
      assert.equal(r2Upload.bytes, compressed);
      assert.match(r2Upload.path, /^stories\/550e8400-e29b-41d4-a716-446655440000\/incoming\/.+\.mp4$/);
      assert.equal(response.body.dados.publicUrl, `https://r2.test/${r2Upload.path}`);
    } finally {
      await closeServer(server);
    }
  });
});
