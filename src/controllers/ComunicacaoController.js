'use strict';

// =============================================================
// ComunicacaoController.js — Rotas Express para /api/comunicacao.
// Camada: interfaces
//
// Rotas:
//   GET   /api/comunicacao/notificacoes             — listar notificações
//   PATCH /api/comunicacao/notificacoes/:id/lida    — marcar como lida
//
// Mensagens diretas foram migradas para P2P com E2E encryption.
// Ver: shared/js/P2PMessageConnectionService.js
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/ComunicacaoService')} comunicacaoService
 * @returns {import('express').Router}
 */
function criarComunicacaoController(comunicacaoService) {
  const router = Router();
  router.use(AuthMiddleware.verificar);

  // ── GET /api/comunicacao/notificacoes ─────────────────────────────────────
  router.get('/notificacoes', async (req, res) => {
    try {
      const limit  = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const notifs = await comunicacaoService.listarNotificacoes(req.user.id, limit);
      res.json({ ok: true, dados: notifs });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── PATCH /api/comunicacao/notificacoes/:id/lida ──────────────────────────
  router.patch('/notificacoes/:id/lida', async (req, res) => {
    try {
      const notif = await comunicacaoService.marcarNotificacaoLida(req.params.id, req.user.id);
      res.json({ ok: true, dados: notif });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarComunicacaoController;
