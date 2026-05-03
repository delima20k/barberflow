// =============================================================
// UserController.js — Rotas Express para /api/usuarios.
// Camada: interfaces
//
// Rotas:
//   GET /api/usuarios/buscar?termo=...&limite=...  — busca por nome (auth)
//   GET /api/usuarios/favoritos-modal?barbershopId=...&professionalId=... (auth)
//   GET /api/usuarios/:id       — busca perfil público por UUID
//   GET /api/usuarios/email/:e  — busca usuário por e-mail (requer auth)
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/UserService')} userService
 * @returns {import('express').Router}
 */
function criarUserController(userService) {
  const router = Router();

  // ── GET /api/usuarios/buscar ──────────────────────────────
  // DEVE vir antes de /:id para não ser capturado como parâmetro.
  // Requer auth: apenas profissionais logados usam esta busca.
  router.get('/buscar', AuthMiddleware.verificar, async (req, res) => {
    try {
      const termo  = String(req.query.termo ?? '').trim();
      const limite = Math.min(Number(req.query.limite) || 20, 50);
      if (!termo) return res.status(400).json({ ok: false, error: 'Parâmetro "termo" obrigatório.' });

      const resultado = await userService.buscarPorNome(termo, limite);
      res.json({ ok: true, dados: resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/usuarios/favoritos-modal ─────────────────────
  // DEVE vir antes de /:id.
  router.get('/favoritos-modal', AuthMiddleware.verificar, async (req, res) => {
    try {
      const { barbershopId, professionalId } = req.query;
      if (!barbershopId || !professionalId) {
        return res.status(400).json({ ok: false, error: 'barbershopId e professionalId obrigatórios.' });
      }
      const resultado = await userService.getClientesFavoritosModal(barbershopId, professionalId);
      res.json({ ok: true, dados: resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/usuarios/:id ─────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const perfil = await userService.buscarPerfilPublico(req.params.id);
      res.json({ ok: true, dados: perfil });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/usuarios/email/:email ────────────────────────
  router.get('/email/:email', AuthMiddleware.verificar, async (req, res) => {
    try {
      const perfil = await userService.buscarPorEmail(req.params.email);
      res.json({ ok: true, dados: perfil });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarUserController;
