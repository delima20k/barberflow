'use strict';

// @deprecated Stack legado. Equivalente BFF: barberflow-bff-api/routes/media.js
// NÃO adicionar novas rotas aqui. Usar barberflow-bff-api/.

// =============================================================
// MediaController.js — Router de mídia (thin — sem lógica de upload).
// Camada: interfaces
//
// Rotas (todas protegidas via AuthMiddleware.verificar):
//
//   POST   /api/media/presigned        — URL de upload direto ao R2 (P2P etapa 1)
//   POST   /api/media/confirmar        — confirma upload + persiste metadados (P2P etapa 2)
//   POST   /api/media/upload-image     — upload server-side com processamento de imagem
//   POST   /api/media/barbershop-image — upload de imagem de barbearia sem processamento
//   DELETE /api/media/:id              — remove arquivo e metadados
//   GET    /api/media/:contexto        — lista arquivos do usuário em um contexto
//
// Handlers pesados de upload foram extraídos para MediaUploadController.js.
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');
const {
  handleUploadImage,
  handleBarbershopImage,
  detectarMime,
  BUCKET_BARBERSHOP,
} = require('./MediaUploadController');

/**
 * @param {import('../services/MediaManager')}            mediaManager
 * @param {import('../services/ImageProcessor')|null}     [imageProcessor]
 * @param {import('../infra/SupabaseStorageClient')|null} [supabaseStorage]
 * @returns {import('express').Router}
 */
function criarMediaController(mediaManager, imageProcessor = null, supabaseStorage = null) {
  const router = Router();

  router.use(AuthMiddleware.verificar);

  // ── POST /api/media/presigned ─────────────────────────────────
  router.post('/presigned', async (req, res) => {
    try {
      const { contexto, contentType } = req.body ?? {};
      const resultado = await mediaManager.gerarUrlPresigned({
        contexto,
        ownerId: req.user.id,
        contentType,
      });
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/media/confirmar ─────────────────────────────────
  router.post('/confirmar', async (req, res) => {
    try {
      const { path, contexto, token, expiresAt, metadata } = req.body ?? {};
      const resultado = await mediaManager.confirmarUpload({
        path,
        ownerId:   req.user.id,
        contexto,
        token,
        expiresAt: typeof expiresAt === 'number' ? expiresAt : Number(expiresAt),
        metadata:  metadata ?? {},
      });
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/media/upload-image ──────────────────────────────
  router.post('/upload-image', ...handleUploadImage(imageProcessor, supabaseStorage, mediaManager));

  // ── POST /api/media/barbershop-image ─────────────────────────
  router.post('/barbershop-image', ...handleBarbershopImage(supabaseStorage, mediaManager));

  // ── DELETE /api/media/:id ─────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      await mediaManager.deletar(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/media/:contexto ──────────────────────────────────
  router.get('/:contexto', async (req, res) => {
    try {
      const items = await mediaManager.listar(req.params.contexto, req.user.id);
      res.json({ ok: true, items });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

// Exporta utilitários para compatibilidade com testes existentes
criarMediaController.BUCKET_BARBERSHOP = BUCKET_BARBERSHOP;
criarMediaController.detectarMime      = detectarMime;

module.exports = criarMediaController;
