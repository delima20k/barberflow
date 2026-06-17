'use strict';

const { Router }                   = require('express');
const AuthMiddleware               = require('../middlewares/auth');
const SchedulerAdminMiddleware     = require('../middlewares/schedulerAdmin');
const MediaController              = require('../controllers/MediaController');
const { OutboxRepository }         = require('../infrastructure/outbox/OutboxRepository');
const { SupabaseMediaRepository }  = require('../infrastructure/media/SupabaseMediaRepository');
const { SupabaseMediaStorageGateway } = require('../infrastructure/media/SupabaseMediaStorageGateway');
const { R2StorageGateway }         = require('../infrastructure/media/R2StorageGateway');
const { MediaConfirmationSigner } = require('../infrastructure/media/MediaConfirmationSigner');
const { MediaUploadService }       = require('../application/media/MediaUploadService');
const { PurgeExpiredStoriesUseCase } = require('../application/stories/PurgeExpiredStoriesUseCase');
const { BarbeariaRepository }      = require('../repositories/BarbeariaRepository');

const LOCK_KEY    = 'scheduler:media.stories-cleanup';
const LOCK_TTL_MS = 120_000;

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
  const storage = deps.storage ?? (useR2 ? r2Instance : new SupabaseMediaStorageGateway({ db }));
  const mediaRepository = deps.mediaRepository ?? new SupabaseMediaRepository(db);
  const outboxRepository = deps.outboxRepository ?? new OutboxRepository({ supabase: db });
  const signer = deps.confirmationSigner ?? new MediaConfirmationSigner();
  const service = deps.service ?? new MediaUploadService({
    storage,
    mediaRepository,
    outboxRepository,
    confirmationSigner: signer,
  });
  const controller = new MediaController(service);
  const router = Router();

  router.post('/presigned', AuthMiddleware.verificar, (req, res, next) => {
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
  router.get('/:mediaId/acesso', AuthMiddleware.verificar, (req, res, next) => {
    if (useR2 && !r2Instance) {
      return res.status(503).json({ ok: false, code: 'R2_UNAVAILABLE', error: 'Serviço de armazenamento de mídia indisponível.' });
    }
    return controller.acesso.call(controller, req, res, next);
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
  const barbeariaRepo   = deps.barbeariaRepository ?? new BarbeariaRepository(db);
  const r2Clean         = deps.r2GatewayCleanup ?? r2Instance;
  const supabaseClean   = deps.supabaseGatewayCleanup ?? new SupabaseMediaStorageGateway({ db });

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
