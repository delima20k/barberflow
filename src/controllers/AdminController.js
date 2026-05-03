'use strict';

// =============================================================
// AdminController.js — Rotas Express para /api/admin.
// Camada: interfaces
//
// Rotas públicas (sem token):
//   POST /api/admin/login          — autenticação do admin (rate limit 5/min)
//
// Rotas protegidas (requer token admin — AdminAuthMiddleware):
//   GET    /api/admin/totais               — contagens globais
//   GET    /api/admin/usuarios             — listar usuários
//   POST   /api/admin/usuarios             — criar usuário
//   DELETE /api/admin/usuarios/:id         — excluir usuário
//   POST   /api/admin/barbeiros            — criar barbeiro
//   DELETE /api/admin/barbeiros/:id        — excluir barbeiro
//   GET    /api/admin/financeiro           — listar subscriptions
//   PATCH  /api/admin/financeiro/:id       — atualizar subscription
// =============================================================

const { Router }            = require('express');
const rateLimit             = require('express-rate-limit');
const AdminAuthMiddleware   = require('../infra/AdminAuthMiddleware');

// Rate limit extra em login: 5 tentativas por minuto por IP
const loginLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { ok: false, error: 'Muitas tentativas de login. Aguarde 1 minuto.' },
});

/**
 * @param {import('../services/AdminService')} adminService
 * @returns {import('express').Router}
 */
function criarAdminController(adminService) {
  const router = Router();

  // ── POST /api/admin/login ─────────────────────────────────────────────────
  // Pública. Rate-limited. Retorna token JWT de admin (4h).
  router.post('/login', loginLimiter, async (req, res) => {
    try {
      const { email, senha } = req.body ?? {};
      const resultado = await adminService.login(email, senha);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── Rotas protegidas — exigem token admin ──────────────────────────────────
  router.use(AdminAuthMiddleware.verificar);

  // ── GET /api/admin/totais ─────────────────────────────────────────────────
  router.get('/totais', async (_req, res) => {
    try {
      const dados = await adminService.getTotais();
      res.json({ ok: true, dados });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/admin/usuarios ───────────────────────────────────────────────
  // Query params: role, limit, offset
  router.get('/usuarios', async (req, res) => {
    try {
      const dados = await adminService.listarUsuarios(req.query);
      res.json({ ok: true, dados, total: dados.length });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/admin/usuarios ──────────────────────────────────────────────
  router.post('/usuarios', async (req, res) => {
    try {
      const resultado = await adminService.criarUsuario(req.body ?? {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── DELETE /api/admin/usuarios/:id ───────────────────────────────────────
  router.delete('/usuarios/:id', async (req, res) => {
    try {
      await adminService.excluirUsuario(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/admin/barbeiros ─────────────────────────────────────────────
  router.post('/barbeiros', async (req, res) => {
    try {
      const resultado = await adminService.criarBarbeiro(req.body ?? {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── DELETE /api/admin/barbeiros/:id ──────────────────────────────────────
  router.delete('/barbeiros/:id', async (req, res) => {
    try {
      await adminService.excluirBarbeiro(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/admin/financeiro ─────────────────────────────────────────────
  // Query params: status, limit, offset
  router.get('/financeiro', async (req, res) => {
    try {
      const dados = await adminService.listarFinanceiro(req.query);
      res.json({ ok: true, dados, total: dados.length });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── PATCH /api/admin/financeiro/:id ──────────────────────────────────────
  router.patch('/financeiro/:id', async (req, res) => {
    try {
      const dados = await adminService.atualizarPlano(req.params.id, req.body ?? {});
      res.json({ ok: true, dados });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarAdminController;
