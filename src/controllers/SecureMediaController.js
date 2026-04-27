'use strict';

// =============================================================
// SecureMediaController.js — Acesso seguro a mídia privada.
// Camada: interfaces
//
// Todas as rotas exigem autenticação (AuthMiddleware.verificar).
// NUNCA expõe a URL pública do R2 — apenas URLs assinadas temporárias.
//
// Rotas:
//
//   GET /api/media/secure/:fileId
//     Valida ownership e gera URL assinada de curta duração para download.
//     Resposta: { ok: true, url: string, expiresIn: number }
//
//   GET /api/media/secure/:fileId/access
//     Verifica se o usuário autenticado tem acesso ao arquivo (sem gerar URL).
//     Útil para o frontend decidir exibir ou não um botão de download.
//     Resposta: { ok: true, hasAccess: boolean }
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/SecureMediaAccessService')} secureMediaAccessService
 * @returns {import('express').Router}
 */
function criarSecureMediaController(secureMediaAccessService) {
  const router = Router();

  // Todas as rotas de acesso seguro exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── GET /api/media/secure/:fileId ──────────────────────────────
  // Gera URL assinada de download de curta duração.
  // Rejeita com 403 se o usuário não for o dono.
  // Rejeita com 404 se o arquivo não existir.
  router.get('/:fileId', async (req, res, next) => {
    try {
      const { url, expiresIn } = await secureMediaAccessService.generateSignedUrl(
        req.params.fileId,
        req.user.id
      );
      res.json({ ok: true, url, expiresIn });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /api/media/secure/:fileId/access ──────────────────────
  // Verifica ownership sem gerar URL.
  // Nunca lança erro — retorna { hasAccess: false } para não autorizado.
  router.get('/:fileId/access', async (req, res, next) => {
    try {
      const hasAccess = await secureMediaAccessService.validateAccess(
        req.user.id,
        req.params.fileId
      );
      res.json({ ok: true, hasAccess });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = criarSecureMediaController;
