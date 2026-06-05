'use strict';

const { Router }                   = require('express');
const AuthMiddleware               = require('../middlewares/auth');
const MediaController              = require('../controllers/MediaController');
const { OutboxRepository }         = require('../infrastructure/outbox/OutboxRepository');
const { SupabaseMediaRepository }  = require('../infrastructure/media/SupabaseMediaRepository');
const { SupabaseMediaStorageGateway } = require('../infrastructure/media/SupabaseMediaStorageGateway');
const { R2StorageGateway }         = require('../infrastructure/media/R2StorageGateway');
const { MediaConfirmationSigner } = require('../infrastructure/media/MediaConfirmationSigner');
const { MediaUploadService }       = require('../application/media/MediaUploadService');

/**
 * Factory de rotas de midia para preservar DI nos testes.
 * Quando STORIES_STORAGE_BACKEND=r2, usa R2StorageGateway em vez do Supabase Storage.
 */
module.exports = function criarMediaRoute(db, deps = {}) {
  const useR2 = process.env.STORIES_STORAGE_BACKEND === 'r2';
  const storage = deps.storage ?? (useR2 ? new R2StorageGateway() : new SupabaseMediaStorageGateway({ db }));
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

  router.post('/presigned', AuthMiddleware.verificar, controller.presigned.bind(controller));
  router.post('/confirmar', AuthMiddleware.verificar, controller.confirmar.bind(controller));
  router.get('/:mediaId/acesso', AuthMiddleware.verificar, controller.acesso.bind(controller));
  return router;
};
