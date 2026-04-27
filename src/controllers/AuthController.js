'use strict';

// =============================================================
// AuthController.js — Rotas Express para /api/auth.
// Camada: interfaces
//
// Rotas públicas (sem token):
//   POST /api/auth/login          — autenticação com e-mail + senha
//   POST /api/auth/refresh        — renovação de access token
//   POST /api/auth/reset-senha    — solicitar reset de senha por e-mail
//   GET  /api/auth/perfil-publico/:id — perfil público de um usuário
//
// Rotas protegidas (requer Bearer token):
//   POST  /api/auth/logout        — encerrar sessão atual
//   PATCH /api/auth/senha         — alterar senha
//   POST  /api/auth/cadastro-perfil — criar perfil pós-signUp
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/CadastroService')} cadastroService
 * @param {import('../services/AuthService')}     authService
 * @returns {import('express').Router}
 */
function criarAuthController(cadastroService, authService) {
  const router = Router();

  // ── POST /api/auth/login ──────────────────────────────────────────────────
  // Pública. Retorna accessToken, refreshToken, expiresAt e userId.
  // Mensagem de erro genérica (anti-enumeração).
  router.post('/login', async (req, res) => {
    try {
      const { email, senha } = req.body ?? {};
      const resultado = await authService.login(email, senha);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/auth/refresh ────────────────────────────────────────────────
  // Pública. Renova o access token com o refresh token do Supabase Auth.
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body ?? {};
      const resultado = await authService.renovarToken(refreshToken);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/auth/logout ─────────────────────────────────────────────────
  // Protegida (precisa do token para revogar a sessão correta).
  // Tolerante: nunca falha do ponto de vista do cliente.
  router.post('/logout', async (req, res) => {
    try {
      const auth  = req.headers['authorization'] ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      await authService.logout(token);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── PATCH /api/auth/senha ─────────────────────────────────────────────────
  // Protegida. Valida força da nova senha antes de alterar.
  router.patch('/senha', AuthMiddleware.verificar, async (req, res) => {
    try {
      const { novaSenha } = req.body ?? {};
      await authService.alterarSenha(req.user.id, novaSenha);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/auth/reset-senha ────────────────────────────────────────────
  // Pública. SEMPRE retorna 200 para e-mail com formato válido (anti-enumeração).
  router.post('/reset-senha', async (req, res) => {
    try {
      const { email } = req.body ?? {};
      await authService.solicitarResetSenha(email);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/auth/cadastro-perfil ────────────────────────────────────────
  // Protegida. Chamado logo após signUp do Supabase Auth.
  // Requer token JWT (já emitido pelo Supabase Auth no signUp).
  router.post('/cadastro-perfil', AuthMiddleware.verificar, async (req, res) => {
    try {
      const resultado = await cadastroService.cadastrarPerfil(req.user.id, req.body);
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/auth/perfil-publico/:id ──────────────────────────────────────
  // Pública — sem autenticação (perfil público sem dados sensíveis).
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

