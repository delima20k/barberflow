'use strict';

const { Router }                       = require('express');
const { BarbeariaRepository }          = require('../repositories/BarbeariaRepository');
const { SupabaseMediaRepository }      = require('../infrastructure/media/SupabaseMediaRepository');
const { R2StorageGateway }             = require('../infrastructure/media/R2StorageGateway');
const { SupabaseMediaStorageGateway }  = require('../infrastructure/media/SupabaseMediaStorageGateway');
const { PurgeExpiredStoriesUseCase }   = require('../application/stories/PurgeExpiredStoriesUseCase');

const LOCK_KEY    = 'scheduler:media.stories-cleanup';
const LOCK_TTL_MS = 120_000;

/**
 * Rotas exclusivas para Vercel Cron Jobs.
 *
 * Montadas em /api/internal/cron — NÃO expor publicamente.
 * Validação: Authorization: Bearer $CRON_SECRET
 * O Vercel injeta automaticamente esse header ao chamar cron jobs.
 *
 * Crons declarados em vercel.json:
 *   GET /api/internal/cron/stories-cleanup  → 0 * * * * (horário)
 */
module.exports = function criarInternalCronRoute(db) {
  const router = Router();

  // Validar CRON_SECRET injetado pelo Vercel em todas as rotas deste router
  router.use((req, res, next) => {
    const secret = process.env.CRON_SECRET;
    const provided = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (!secret || provided !== secret) {
      return res.status(401).json({ ok: false });
    }
    next();
  });

  /**
   * GET /api/internal/cron/stories-cleanup
   *
   * Disparo horário automático de limpeza de Stories expirados no R2.
   * Adquire o mesmo lock Redis usado pela rota admin POST /api/v1/media/stories/cleanup.
   * Retorna 200 com relatório (skipped: true se outro processo já está executando).
   */
  router.get('/stories-cleanup', async (req, res) => {
    const r2 = R2StorageGateway.tryCreate();
    if (!r2) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'r2_unavailable' });
    }

    let lock        = null;
    let lockHandle  = null;

    if (process.env.REDIS_URL) {
      try {
        const Redis = require('ioredis'); // eslint-disable-line global-require
        const { RedisDistributedLock } = require('../infrastructure/scheduler/RedisDistributedLock'); // eslint-disable-line global-require
        const client = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
        lock = new RedisDistributedLock({ redisClient: client });
        lockHandle = await lock.acquire({ key: LOCK_KEY, ttlMs: LOCK_TTL_MS, owner: 'vercel-cron' });
        if (!lockHandle.acquired) {
          return res.status(200).json({ ok: true, skipped: true, reason: 'lock_busy' });
        }
      } catch { /* sem Redis: prossegue sem lock distribuído */ }
    }

    try {
      const relatorio = await new PurgeExpiredStoriesUseCase({
        storyRepository:        new BarbeariaRepository(db),
        mediaRepository:        new SupabaseMediaRepository(db),
        r2Gateway:              r2,
        supabaseStorageGateway: new SupabaseMediaStorageGateway({ db }),
        batchSize:              Number(process.env.STORY_CLEANUP_BATCH_SIZE ?? 50),
      }).execute({ dryRun: false, includeR2Scan: false });

      return res.status(200).json({ ok: true, ...relatorio });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    } finally {
      if (lock && lockHandle?.acquired) await lock.release(lockHandle);
    }
  });

  return router;
};
