'use strict';

// =============================================================
// AuthController.js — Rotas Express para /api/auth.
// Camada: interfaces
//
// Rotas:
//   POST /api/auth/cadastro-perfil  — cria perfil pós-signUp
//   GET  /api/auth/perfil-publico/:id — perfil público de um usuário
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/CadastroService')} cadastroService
 * @returns {import('express').Router}
 */
function criarAuthController(cadastroService) {
  const router = Router();

  // ── POST /api/auth/cadastro-perfil ────────────────────────────────────────
  // Chamado logo após signUp do Supabase Auth.
  // Requer token JWT (já emitido pelo Supabase Auth no signUp).
  router.post('/cadastro-perfil', AuthMiddleware.verificar, async (req, res) => {
    try {
      // Injeta o userId do token — nunca do body (segurança)
      const resultado = await cadastroService.cadastrarPerfil(req.user.id, req.body);
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/auth/perfil-publico/:id ──────────────────────────────────────
  // Rota pública — não requer autenticação (perfil_público sem dados sensíveis).
  router.get('/perfil-publico/:id', async (req, res) => {
    try {
      const perfil = await cadastroService.buscarPerfilPublico(req.params.id);
      if (!perfil) return res.status(404).json({ ok: false, error: 'Perfil não encontrado.' });
      res.json({ ok: true, dados: perfil });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarAuthController;
