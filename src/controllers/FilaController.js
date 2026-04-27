'use strict';

// =============================================================
// FilaController.js — Rotas Express para /api/fila.
// Camada: interfaces
//
// Rotas:
//   GET    /api/fila/:barbeariaId                    — estado da fila
//   POST   /api/fila/:barbeariaId/entrar             — entrar na fila
//   DELETE /api/fila/:barbeariaId/entradas/:id/sair  — sair da fila
//   PATCH  /api/fila/:barbeariaId/entradas/:id/status — avançar status
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/FilaService')} filaService
 * @returns {import('express').Router}
 */
function criarFilaController(filaService) {
  const router = Router();
  router.use(AuthMiddleware.verificar);

  // ── GET /api/fila/:barbeariaId ────────────────────────────────────────────
  router.get('/:barbeariaId', async (req, res) => {
    try {
      const fila = await filaService.verFila(req.params.barbeariaId);
      res.json({ ok: true, dados: fila });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/fila/:barbeariaId/entrar ────────────────────────────────────
  router.post('/:barbeariaId/entrar', async (req, res) => {
    try {
      const entrada = await filaService.entrarFila(
        req.params.barbeariaId,
        req.user.id,
        req.body,
      );
      res.status(201).json({ ok: true, dados: entrada });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── DELETE /api/fila/:barbeariaId/entradas/:id/sair ───────────────────────
  router.delete('/:barbeariaId/entradas/:id/sair', async (req, res) => {
    try {
      await filaService.sairFila(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── PATCH /api/fila/:barbeariaId/entradas/:id/status ─────────────────────
  router.patch('/:barbeariaId/entradas/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ ok: false, error: 'Campo "status" obrigatório.' });

      const entrada = await filaService.atualizarStatusEntrada(req.params.id, status);
      res.json({ ok: true, dados: entrada });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarFilaController;
