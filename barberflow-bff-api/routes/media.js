'use strict';

const express                      = require('express');
const { Router }                   = express;
const AuthMiddleware               = require('../middlewares/auth');
const SchedulerAdminMiddleware     = require('../middlewares/schedulerAdmin');
const MediaController              = require('../controllers/MediaController');
const { OutboxRepository }         = require('../infrastructure/outbox/OutboxRepository');
const { SupabaseMediaRepository }  = require('../infrastructure/media/SupabaseMediaRepository');
const { SupabaseMediaStorageGateway } = require('../infrastructure/media/SupabaseMediaStorageGateway');
const { R2StorageGateway }         = require('../infrastructure/media/R2StorageGateway');
const { MediaConfirmationSigner } = require('../infrastructure/media/MediaConfirmationSigner');
const { VideoCompressionService }  = require('../infrastructure/media/VideoCompressionService');
const { MediaUploadService }       = require('../application/media/MediaUploadService');
const { StoryMediaInteractionService } = require('../application/media/StoryMediaInteractionService');
const { PurgeExpiredStoriesUseCase } = require('../application/stories/PurgeExpiredStoriesUseCase');
const { DeleteStoryUseCase }       = require('../application/stories/DeleteStoryUseCase');
const BarbeariaRepository          = require('../repositories/BarbeariaRepository');

const LOCK_KEY    = 'scheduler:media.stories-cleanup';
const LOCK_TTL_MS = 120_000;

function isStoryVideoRequest(body = {}) {
  return String(body.context ?? body.contexto ?? '').toLowerCase() === 'stories'
    && String(body.contentType ?? '').toLowerCase() === 'video/mp4';
}

function r2UnavailableResponse(res) {
  return res.status(503).json({
    ok: false,
    code: 'R2_UNAVAILABLE',
    error: 'Servico de armazenamento de midia indisponivel.',
  });
}

const unavailableStorage = {
  createSignedUpload: async () => {
    const err = new Error('Servico de armazenamento de midia indisponivel.');
    err.status = 503;
    throw err;
  },
  createSignedAccess: async () => {
    const err = new Error('Servico de armazenamento de midia indisponivel.');
    err.status = 503;
    throw err;
  },
};

/**
 * Factory de rotas de midia para preservar DI nos testes.
 * Quando STORIES_STORAGE_BACKEND=r2, usa R2StorageGateway em vez do Supabase Storage.
 */
module.exports = function criarMediaRoute(db, deps = {}) {
  const useR2 = process.env.STORIES_STORAGE_BACKEND === 'r2';
  const r2Instance = deps.r2Instance ?? R2StorageGateway.tryCreate();
  if (useR2 && !r2Instance) {
    console.warn('[media] R2StorageGateway indisponível — endpoints de upload retornarão 503');
  }
  const storage = deps.storage ?? (useR2 ? (r2Instance ?? unavailableStorage) : new SupabaseMediaStorageGateway({ db }));
  const mediaRepository = deps.mediaRepository ?? new SupabaseMediaRepository(db);
  const outboxRepository = deps.outboxRepository ?? new OutboxRepository({ supabase: db });
  const signer = deps.confirmationSigner ?? new MediaConfirmationSigner();
  const videoCompressionService = deps.videoCompressionService ?? new VideoCompressionService();
  const service = deps.service ?? new MediaUploadService({
    storage,
    mediaRepository,
    outboxRepository,
    confirmationSigner: signer,
    videoCompressionService,
  });
  const controller = new MediaController(service);
  const compressedStoryService = deps.compressedStoryService ?? new MediaUploadService({
    storage: r2Instance ?? unavailableStorage,
    mediaRepository,
    outboxRepository,
    confirmationSigner: signer,
    videoCompressionService,
  });
  const compressedStoryController = new MediaController(compressedStoryService);
  const router = Router();
  const barbeariaRepo   = deps.barbeariaRepository ?? new BarbeariaRepository(db);
  const supabaseClean   = deps.supabaseGatewayCleanup ?? new SupabaseMediaStorageGateway({ db });
  const deleteStoryUseCase = r2Instance
    ? new DeleteStoryUseCase({
        storyRepository:        barbeariaRepo,
        mediaRepository,
        r2Gateway:              r2Instance,
        supabaseStorageGateway: supabaseClean,
      })
    : null;
  const storyInteractionService = deps.storyInteractionService ?? new StoryMediaInteractionService({
    storyRepository: barbeariaRepo,
    deleteStoryUseCase,
  });
  const storyInteractionController = new MediaController(storyInteractionService);

  router.post('/presigned', AuthMiddleware.verificar, (req, res, next) => {
    if (isStoryVideoRequest(req.body) && (!useR2 || !r2Instance)) {
      return r2UnavailableResponse(res);
    }
    if (useR2 && !r2Instance) {
      return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'Serviço de armazenamento de mídia indisponível.' });
    }
    return controller.presigned.call(controller, req, res, next);
  });
  router.post('/confirmar', AuthMiddleware.verificar, (req, res, next) => {
    if (useR2 && !r2Instance) {
      return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'Serviço de armazenamento de mídia indisponível.' });
    }
    return controller.confirmar.call(controller, req, res, next);
  });
  router.post('/stories/upload-compressed',
    AuthMiddleware.verificar,
    express.raw({ type: 'video/mp4', limit: '128mb' }),
    (req, res, next) => {
      if (!r2Instance) {
        return r2UnavailableResponse(res);
      }
      return compressedStoryController.uploadCompressedStory.call(compressedStoryController, req, res, next);
    },
  );
  router.get('/:mediaId/acesso', AuthMiddleware.verificar, (req, res, next) => {
    if (useR2 && !r2Instance) {
      return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'Serviço de armazenamento de mídia indisponível.' });
    }
    return controller.acesso.call(controller, req, res, next);
  });

  router.post('/:mediaId/thumbnail', AuthMiddleware.verificar, (req, res, next) => {
    if (useR2 && !r2Instance) {
      return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'Serviço de armazenamento de mídia indisponível.' });
    }
    return controller.salvarThumb.call(controller, req, res, next);
  });

  router.post('/:mediaId/like', AuthMiddleware.verificar, (req, res, next) =>
    storyInteractionController.toggleLike.call(storyInteractionController, req, res, next)
  );

  router.delete('/:mediaId', AuthMiddleware.verificar, (req, res, next) => {
    if (!r2Instance) {
      return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'Servico de armazenamento de midia indisponivel.' });
    }
    return storyInteractionController.excluir.call(storyInteractionController, req, res, next);
  });

  // ── Admin: cleanup manual de stories R2 ──────────────────────
  let lock = deps.lock ?? null;
  if (!lock && process.env.REDIS_URL) {
    try {
      const Redis = require('ioredis'); // eslint-disable-line global-require
      const { RedisDistributedLock } = require('../infrastructure/scheduler/RedisDistributedLock'); // eslint-disable-line global-require
      const redisClient = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
      lock = new RedisDistributedLock({ redisClient });
    } catch { /* sem Redis: rota POST retorna 503 */ }
  }
  const r2Clean         = deps.r2GatewayCleanup ?? r2Instance;

  function buildPurgeUseCase(batchSize) {
    return new PurgeExpiredStoriesUseCase({
      storyRepository:        barbeariaRepo,
      mediaRepository,
      r2Gateway:              r2Clean,
      supabaseStorageGateway: supabaseClean,
      batchSize: batchSize ? Number(batchSize) : undefined,
    });
  }

  // GET /api/v1/media/stories/cleanup?batchSize=50&includeR2Scan=false
  // Dry-run (somente leitura). Exige admin token.
  router.get('/stories/cleanup',
    AuthMiddleware.verificar, SchedulerAdminMiddleware.verificar,
    async (req, res) => {
      try {
        const relatorio = await buildPurgeUseCase(req.query.batchSize)
          .execute({ dryRun: true, includeR2Scan: req.query.includeR2Scan === 'true' });
        return res.status(200).json({ ok: true, data: relatorio });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // POST /api/v1/media/stories/cleanup
  // Cleanup real com lock Redis. 409 se scheduler em execução.
  router.post('/stories/cleanup',
    AuthMiddleware.verificar, SchedulerAdminMiddleware.verificar,
    async (req, res) => {
      if (!lock) return res.status(503).json({ ok: false, error: 'Lock Redis nao configurado.' });
      if (!r2Clean) return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'R2 nao configurado.' });
      const lockHandle = await lock.acquire({ key: LOCK_KEY, ttlMs: LOCK_TTL_MS, owner: 'http-admin' });
      if (!lockHandle.acquired) {
        return res.status(409).json({ ok: false, error: 'Cleanup ja em execucao. Aguarde.' });
      }
      try {
        const relatorio = await buildPurgeUseCase(req.body?.batchSize)
          .execute({ dryRun: false, includeR2Scan: Boolean(req.body?.includeR2Scan ?? false) });
        return res.status(200).json({ ok: true, data: relatorio });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      } finally {
        await lock.release(lockHandle);
      }
    }
  );

  return router;
};
