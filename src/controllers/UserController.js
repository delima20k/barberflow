'use strict';

// =============================================================
// UserController.js — Rotas Express para /api/usuarios.
// Camada: interfaces
//
// Rotas:
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
  // Requer autenticação: apenas usuários logados podem fazer lookup por e-mail
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
