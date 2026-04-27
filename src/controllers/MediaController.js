'use strict';

// =============================================================
// MediaController.js — Rotas Express para /api/media.
// Camada: interfaces
//
// Rotas (todas protegidas via AuthMiddleware.verificar):
//
//   POST   /api/media/presigned
//     Etapa 1 do fluxo P2P: gera URL de upload direto ao R2.
//     Body: { contexto, contentType }
//     Resposta: { uploadUrl, path, publicUrl, token, expiresAt }
//
//   POST   /api/media/confirmar
//     Etapa 2 do fluxo P2P: confirma upload + salva metadados.
//     Body: { path, contexto, token, expiresAt, metadata? }
//     Resposta: { id, path, publicUrl, tamanhoBytes }
//
//   DELETE /api/media/:id
//     Remove arquivo do R2 e registro de metadados.
//     Resposta: { ok: true }
//
//   GET    /api/media/:contexto
//     Lista arquivos do usuário autenticado em um contexto.
//     Resposta: { ok: true, items: [...] }
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/MediaManager')} mediaManager
 * @returns {import('express').Router}
 */
function criarMediaController(mediaManager) {
  const router = Router();

  // Todas as rotas de mídia exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── POST /api/media/presigned ─────────────────────────────────
  // Etapa 1 do P2P: gera URL presigned para upload direto ao R2.
  // O arquivo não passa pelo servidor.
  router.post('/presigned', async (req, res) => {
    try {
      const ownerId     = req.user.id;
      const { contexto, contentType } = req.body ?? {};

      const resultado = await mediaManager.gerarUrlPresigned({
        contexto,
        ownerId,
        contentType,
      });

      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/media/confirmar ─────────────────────────────────
  // Etapa 2 do P2P: confirma que o upload ocorreu e persiste metadados.
  router.post('/confirmar', async (req, res) => {
    try {
      const ownerId = req.user.id;
      const { path, contexto, token, expiresAt, metadata } = req.body ?? {};

      const resultado = await mediaManager.confirmarUpload({
        path,
        ownerId,
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

  // ── DELETE /api/media/:id ─────────────────────────────────────
  // Remove o arquivo do R2 e o registro de metadados.
  router.delete('/:id', async (req, res) => {
    try {
      const ownerId = req.user.id;
      const mediaId = req.params.id;

      await mediaManager.deletar(mediaId, ownerId);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/media/:contexto ──────────────────────────────────
  // Lista todos os arquivos do usuário em um contexto.
  router.get('/:contexto', async (req, res) => {
    try {
      const ownerId  = req.user.id;
      const contexto = req.params.contexto;

      const items = await mediaManager.listar(contexto, ownerId);
      res.json({ ok: true, items });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarMediaController;
