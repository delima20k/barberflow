'use strict';

const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { suite, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_ENV = 'test';

const AuthMiddleware = require('../middlewares/auth');
const SchedulerAdminMiddleware = require('../middlewares/schedulerAdmin');
const { MediaPolicyCatalog } = require('../config/media');
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

function createCleanupDeps({ r2Instance, lock = null } = {}) {
  return {
    r2Instance,
    lock,
    barbeariaRepository: {
      listarStoriesExpirados: async () => [],
      contarOutrasReferencias: async () => 0,
      excluirStoriesPorIds: async () => {},
    },
    mediaRepository: {
      reserve: async media => media,
      confirmUploaded: async media => ({ id: media.mediaId, path: media.path }),
      getOwnedVariant: async () => null,
      listarVariantesPorMediaId: async () => [],
      listarPendentesLimpeza: async () => [],
      existePorId: async () => true,
    },
    outboxRepository: { save: async () => 'outbox-1' },
    confirmationSigner: { sign: () => 'token', verify: () => true },
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
    let originalVariant = null;
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
        salvarVariante: async (mediaId, variant) => { originalVariant = { mediaId, variant }; },
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
      assert.equal(originalVariant.variant.name, 'original');
      assert.equal(originalVariant.variant.storagePath, r2Upload.path);
      assert.equal(response.body.dados.publicUrl, `https://r2.test/${r2Upload.path}`);
    } finally {
      await closeServer(server);
    }
  });

  test('mantem limite tecnico de story video em 128MB sem regra de produto por tamanho', () => {
    const policy = MediaPolicyCatalog.context('stories');
    const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/media.js'), 'utf8');

    assert.equal(policy.maxBytes, 128 * 1024 * 1024);
    assert.match(routeSource, /express\.raw\(\{\s*type:\s*'video\/mp4',\s*limit:\s*'128mb'\s*\}\)/);
  });
});

suite('media route - story messages', () => {
  const originalAuth = AuthMiddleware.verificar;

  beforeEach(() => {
    AuthMiddleware.verificar = (req, _res, next) => {
      req.user = { id: OWNER_ID, email: 'test@barberflow.com' };
      next();
    };
  });

  afterEach(() => {
    AuthMiddleware.verificar = originalAuth;
  });

  test('POST /:mediaId/messages chama service de mensagem privada', async () => {
    const mediaId = '550e8400-e29b-41d4-a716-446655440001';
    let call = null;
    const app = express();
    app.use(express.json());
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), {
      storyInteractionService: {
        sendMessage: async (userId, id, payload) => {
          call = { userId, id, payload };
          return {
            media_id: id,
            story_id: '550e8400-e29b-41d4-a716-446655440002',
            message: { id: 'msg-1', body: payload.body, createdAt: '2026-06-26T12:00:00.000Z' },
          };
        },
      },
    }));

    const server = await startServer(app);
    try {
      const response = await request(server, 'POST', `/api/v1/media/${mediaId}/messages`, {
        body: Buffer.from(JSON.stringify({ body: 'Top', clientMessageId: 'client-1' })),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.dados.message.body, 'Top');
      assert.deepEqual(call, {
        userId: OWNER_ID,
        id: mediaId,
        payload: { body: 'Top', clientMessageId: 'client-1' },
      });
    } finally {
      await closeServer(server);
    }
  });

  test('GET /:mediaId/messages chama service de listagem privada', async () => {
    const mediaId = '550e8400-e29b-41d4-a716-446655440001';
    let call = null;
    const app = express();
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), {
      storyInteractionService: {
        listMessages: async (userId, id, query) => {
          call = { userId, id, limit: query.limit };
          return {
            media_id: id,
            story_id: '550e8400-e29b-41d4-a716-446655440002',
            messages: [],
            likesCount: 0,
          };
        },
      },
    }));

    const server = await startServer(app);
    try {
      const response = await request(server, 'GET', `/api/v1/media/${mediaId}/messages?limit=50`, {
        headers: { Authorization: 'Bearer test' },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.dados.messages, []);
      assert.deepEqual(call, { userId: OWNER_ID, id: mediaId, limit: '50' });
    } finally {
      await closeServer(server);
    }
  });
});

suite('media route - R2 operation controls', () => {
  const originalAuth = AuthMiddleware.verificar;
  const originalAdmin = SchedulerAdminMiddleware.verificar;
  const originalBackend = process.env.STORIES_STORAGE_BACKEND;
  const originalScanEnv = process.env.R2_CLEANUP_SCAN_ENABLED;

  beforeEach(() => {
    process.env.STORIES_STORAGE_BACKEND = 'r2';
    delete process.env.R2_CLEANUP_SCAN_ENABLED;
    AuthMiddleware.verificar = (req, _res, next) => {
      req.user = { id: OWNER_ID, email: 'test@barberflow.com' };
      next();
    };
    SchedulerAdminMiddleware.verificar = (_req, _res, next) => next();
  });

  afterEach(() => {
    AuthMiddleware.verificar = originalAuth;
    SchedulerAdminMiddleware.verificar = originalAdmin;
    if (originalBackend == null) delete process.env.STORIES_STORAGE_BACKEND;
    else process.env.STORIES_STORAGE_BACKEND = originalBackend;
    if (originalScanEnv == null) delete process.env.R2_CLEANUP_SCAN_ENABLED;
    else process.env.R2_CLEANUP_SCAN_ENABLED = originalScanEnv;
  });

  test('cleanup dry-run sem R2 configurado retorna 503 controlado e nao derruba BFF', async () => {
    const originalR2Env = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKey: process.env.R2_ACCESS_KEY_ID,
      secretKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET_NAME,
    };
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    const app = express();
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), {
      ...createCleanupDeps(),
    }));

    const server = await startServer(app);
    try {
      const response = await request(server, 'GET', '/api/v1/media/stories/cleanup');
      assert.equal(response.status, 503);
      assert.equal(response.body.code, 'R2_UNAVAILABLE');
    } finally {
      await closeServer(server);
      if (originalR2Env.accountId == null) delete process.env.R2_ACCOUNT_ID;
      else process.env.R2_ACCOUNT_ID = originalR2Env.accountId;
      if (originalR2Env.accessKey == null) delete process.env.R2_ACCESS_KEY_ID;
      else process.env.R2_ACCESS_KEY_ID = originalR2Env.accessKey;
      if (originalR2Env.secretKey == null) delete process.env.R2_SECRET_ACCESS_KEY;
      else process.env.R2_SECRET_ACCESS_KEY = originalR2Env.secretKey;
      if (originalR2Env.bucket == null) delete process.env.R2_BUCKET_NAME;
      else process.env.R2_BUCKET_NAME = originalR2Env.bucket;
    }
  });

  test('cleanup dry-run nao chama R2 scan quando includeR2Scan=false', async () => {
    let listCalls = 0;
    const r2Instance = {
      async *listObjectsByPrefixPaginated() {
        listCalls++;
        yield [];
      },
      deleteObject: async () => {},
    };
    const app = express();
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), createCleanupDeps({ r2Instance })));

    const server = await startServer(app);
    try {
      const response = await request(server, 'GET', '/api/v1/media/stories/cleanup?includeR2Scan=false');
      assert.equal(response.status, 200);
      assert.equal(listCalls, 0);
      assert.equal(response.body.data.r2ScanObjectsInspected, 0);
    } finally {
      await closeServer(server);
    }
  });

  test('cleanup bloqueia includeR2Scan=true sem env explicita', async () => {
    let listCalls = 0;
    const r2Instance = {
      async *listObjectsByPrefixPaginated() {
        listCalls++;
        yield [];
      },
      deleteObject: async () => {},
    };
    const app = express();
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), createCleanupDeps({ r2Instance })));

    const server = await startServer(app);
    try {
      const response = await request(server, 'GET', '/api/v1/media/stories/cleanup?includeR2Scan=true');
      assert.equal(response.status, 403);
      assert.equal(response.body.code, 'R2_SCAN_DISABLED');
      assert.equal(listCalls, 0);
    } finally {
      await closeServer(server);
    }
  });

  test('presigned de story chama gateway R2 no maximo uma vez por request', async () => {
    let createSignedUploadCalls = 0;
    const r2Instance = {
      createSignedUpload: async ({ path }) => {
        createSignedUploadCalls++;
        return {
          uploadUrl: `https://r2.test/upload/${path}`,
          publicUrl: `https://r2.test/public/${path}`,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        };
      },
      publicUrl: path => `https://r2.test/public/${path}`,
    };
    const app = express();
    app.use(express.json());
    app.use('/api/v1/media', criarMediaRoute(createDbStub(), {
      r2Instance,
      mediaRepository: {
        reserve: async media => media,
      },
      outboxRepository: { save: async () => 'outbox-1' },
      confirmationSigner: { sign: () => 'token', verify: () => true },
    }));

    const body = Buffer.from(JSON.stringify({
      contexto: 'stories',
      contentType: 'image/webp',
      fileName: 'story.webp',
      sizeBytes: 1024,
    }));
    const server = await startServer(app);
    try {
      const response = await request(server, 'POST', '/api/v1/media/presigned', {
        body,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
        },
      });

      assert.equal(response.status, 201);
      assert.equal(createSignedUploadCalls, 1);
    } finally {
      await closeServer(server);
    }
  });
});
