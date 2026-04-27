'use strict';

// =============================================================
// ComunicacaoController.js — Rotas Express para /api/comunicacao.
// Camada: interfaces
//
// Rotas:
//   GET   /api/comunicacao/notificacoes             — listar notificações
//   PATCH /api/comunicacao/notificacoes/:id/lida    — marcar como lida
//   GET   /api/comunicacao/mensagens/:contatoId     — conversa
//   POST  /api/comunicacao/mensagens                — enviar mensagem
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
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 30;
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

  // ── GET /api/comunicacao/mensagens/:contatoId ─────────────────────────────
  router.get('/mensagens/:contatoId', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const msgs = await comunicacaoService.listarConversa(req.user.id, req.params.contatoId, limit);
      res.json({ ok: true, dados: msgs });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/comunicacao/mensagens ───────────────────────────────────────
  router.post('/mensagens', async (req, res) => {
    try {
      const { destinatario_id, conteudo } = req.body;
      if (!destinatario_id || !conteudo)
        return res.status(400).json({ ok: false, error: 'destinatario_id e conteudo são obrigatórios.' });

      const msg = await comunicacaoService.enviarMensagem(req.user.id, destinatario_id, conteudo);
      res.status(201).json({ ok: true, dados: msg });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarComunicacaoController;
