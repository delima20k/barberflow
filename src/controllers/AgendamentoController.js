'use strict';

// =============================================================
// AgendamentoController.js — Rotas Express para /api/agendamentos.
// Camada: interfaces
//
// Recebe a requisição, delega ao AgendamentoService, retorna resposta.
// Sem lógica de negócio — apenas binding HTTP.
//
// Rotas:
//   GET    /api/agendamentos            — listar (por profissional ou cliente)
//   POST   /api/agendamentos            — criar novo agendamento
//   PATCH  /api/agendamentos/:id/status — atualizar status
//   DELETE /api/agendamentos/:id        — cancelar agendamento
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * Cria e retorna o router de agendamentos com o service injetado.
 * @param {import('../services/AgendamentoService')} agendamentoService
 * @returns {import('express').Router}
 */
function criarAgendamentoController(agendamentoService) {
  const router = Router();

  // Todas as rotas exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── GET /api/agendamentos ─────────────────────────────────
  // Query params: professionalId | clientId, inicio, fim
  router.get('/', async (req, res) => {
    try {
      const { professionalId, clientId, inicio, fim } = req.query;
      let agendamentos;

      if (professionalId) {
        agendamentos = await agendamentoService.listarPorProfissional(professionalId, inicio, fim);
      } else if (clientId) {
        agendamentos = await agendamentoService.listarPorCliente(clientId);
      } else {
        return res.status(400).json({ ok: false, error: 'Informe professionalId ou clientId.' });
      }

      res.json({ ok: true, dados: agendamentos.map(a => a.toJSON()) });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/agendamentos ────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      // Injeta o client_id do token JWT para garantir autoria
      const dados = { ...req.body, client_id: req.user.id };
      const agendamento = await agendamentoService.criarAgendamento(dados);
      res.status(201).json({ ok: true, dados: agendamento.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── PATCH /api/agendamentos/:id/status ────────────────────
  router.patch('/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      const agendamento = await agendamentoService.atualizarStatus(req.params.id, status, req.user.id);
      res.json({ ok: true, dados: agendamento.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── DELETE /api/agendamentos/:id ──────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      const agendamento = await agendamentoService.cancelarAgendamento(req.params.id, req.user.id);
      res.json({ ok: true, dados: agendamento.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarAgendamentoController;
