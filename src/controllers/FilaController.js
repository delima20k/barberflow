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
      const entrada = await filaService.atualizarStatusEntrada(req.params.id, req.body.status);
      res.json({ ok: true, dados: entrada });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/fila/:barbeariaId/estado ─────────────────────────────────────
  // Polling condicional: aceita ?since=<ISO> para retornar { semMudancas: true }
  // quando não há alterações desde o timestamp fornecido — evita re-renders.
  router.get('/:barbeariaId/estado', async (req, res) => {
    try {
      const since     = req.query.since ?? null;
      const resultado = await filaService.estadoFila(req.params.barbeariaId, since);

      // Sempre retorna dentro de `dados` para o #req do BackendApiService
      // mapear corretamente (json?.dados ?? json → data).
      if (resultado.semMudancas) {
        return res.json({ ok: true, dados: { semMudancas: true } });
      }

      res.json({ ok: true, dados: resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarFilaController;
