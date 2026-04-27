'use strict';

// =============================================================
// LgpdController.js — Rotas Express para /api/lgpd.
// Camada: interfaces
//
// Rotas:
//   GET  /api/lgpd/consentimentos/:userId     — verificar aceite
//   POST /api/lgpd/consentimentos             — registrar aceite
//   POST /api/lgpd/solicitacoes-exclusao      — solicitar exclusão de dados
//   POST /api/lgpd/acesso-dados-log           — registrar log de acesso
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/LgpdService')} lgpdService
 * @returns {import('express').Router}
 */
function criarLgpdController(lgpdService) {
  const router = Router();
  router.use(AuthMiddleware.verificar);

  // ── GET /api/lgpd/consentimentos/:userId ──────────────────────────────────
  router.get('/consentimentos/:userId', async (req, res) => {
    try {
      // Usuário só pode verificar o próprio consentimento
      if (req.params.userId !== req.user.id)
        return res.status(403).json({ ok: false, error: 'Não autorizado.' });

      const resultado = await lgpdService.verificarConsentimento(req.params.userId);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/lgpd/consentimentos ─────────────────────────────────────────
  router.post('/consentimentos', async (req, res) => {
    try {
      const { version } = req.body;
      if (!version) return res.status(400).json({ ok: false, error: 'Campo "version" obrigatório.' });

      const ip         = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? null;
      const user_agent = req.headers['user-agent'] ?? null;

      const aceite = await lgpdService.registrarConsentimento(req.user.id, { version, ip, user_agent });
      res.status(201).json({ ok: true, dados: aceite });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/lgpd/solicitacoes-exclusao ──────────────────────────────────
  router.post('/solicitacoes-exclusao', async (req, res) => {
    try {
      const { motivo } = req.body;
      if (!motivo) return res.status(400).json({ ok: false, error: 'Campo "motivo" obrigatório.' });

      const solicitacao = await lgpdService.solicitarExclusaoDados(req.user.id, motivo);
      res.status(201).json({ ok: true, dados: solicitacao });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/lgpd/acesso-dados-log ──────────────────────────────────────
  router.post('/acesso-dados-log', async (req, res) => {
    try {
      const { target_user_id, data_type, purpose } = req.body;
      if (!target_user_id || !data_type || !purpose)
        return res.status(400).json({ ok: false, error: 'target_user_id, data_type e purpose são obrigatórios.' });

      const log = await lgpdService.registrarLogAcesso({
        accessed_by:    req.user.id,
        target_user_id,
        data_type,
        purpose,
      });
      res.status(201).json({ ok: true, dados: log });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarLgpdController;
