'use strict';

// =============================================================
// ProfissionalController.js — Rotas Express para /api/profissionais.
// Camada: interfaces
//
// Rotas:
//   GET  /api/profissionais/:id                     — buscar profissional
//   GET  /api/profissionais/:id/cadeiras            — cadeiras da barbearia
//   GET  /api/profissionais/:id/portfolio           — portfólio
//   POST /api/profissionais/:id/portfolio           — adicionar imagem
//   DELETE /api/profissionais/:id/portfolio/:imgId  — remover imagem
//   GET  /api/profissionais/barbearia/:barbershopId — listar por barbearia
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');
const RoleMiddleware = require('../infra/RoleMiddleware');

/**
 * @param {import('../services/ProfissionalService')} profissionalService
 * @returns {import('express').Router}
 */
function criarProfissionalController(profissionalService) {
  const router = Router();
  router.use(AuthMiddleware.verificar);

  // ── GET /api/profissionais/barbearia/:barbershopId ────────────────────────
  router.get('/barbearia/:barbershopId', async (req, res) => {
    try {
      const profissionais = await profissionalService.listarPorBarbearia(req.params.barbershopId);
      res.json({ ok: true, dados: profissionais.map(p => p.toJSON()) });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/profissionais/:id ────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const profissional = await profissionalService.buscarProfissional(req.params.id);
      res.json({ ok: true, dados: profissional.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/profissionais/:id/cadeiras ───────────────────────────────────
  router.get('/:id/cadeiras', async (req, res) => {
    try {
      const cadeiras = await profissionalService.listarCadeiras(req.params.id);
      res.json({ ok: true, dados: cadeiras });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/profissionais/:id/portfolio ──────────────────────────────────
  router.get('/:id/portfolio', async (req, res) => {
    try {
      const imagens = await profissionalService.listarPortfolio(req.params.id);
      res.json({ ok: true, dados: imagens });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/profissionais/:id/portfolio ─────────────────────────────────
  // Só profissionais podem adicionar ao próprio portfólio.
  // req.user.id é o professionalId — sem comparar com :id (previne IDOR).
  router.post('/:id/portfolio', RoleMiddleware.profissional, async (req, res) => {
    try {
      const imagem = await profissionalService.adicionarPortfolioImagem(req.user.id, req.body);
      res.status(201).json({ ok: true, dados: imagem });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── DELETE /api/profissionais/:id/portfolio/:imgId ────────────────────────
  // O service valida que a imagem pertence ao req.user.id informado.
  router.delete('/:id/portfolio/:imgId', RoleMiddleware.profissional, async (req, res) => {
    try {
      await profissionalService.removerPortfolioImagem(req.params.imgId, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarProfissionalController;
