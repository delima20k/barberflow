'use strict';

// ============================================================
// admin.js — Rotas da dashboard administrativa no BFF.
//
// Rotas públicas (sem token):
//   POST /api/v1/admin/login          — autenticação (rate limit 5/min)
//
// Rotas protegidas (requerem token admin — AdminAuthMiddleware):
//   GET    /api/v1/admin/totais               — contagens globais
//   GET    /api/v1/admin/usuarios             — listar usuários
//   POST   /api/v1/admin/usuarios             — criar usuário
//   DELETE /api/v1/admin/usuarios/:id         — excluir usuário
//   POST   /api/v1/admin/barbeiros            — criar barbeiro
//   DELETE /api/v1/admin/barbeiros/:id        — excluir barbeiro
//   GET    /api/v1/admin/financeiro           — listar subscriptions
//   PATCH  /api/v1/admin/financeiro/:id       — atualizar subscription
// ============================================================

const { Router }           = require('express');
const rateLimit            = require('express-rate-limit');
const AdminAuthMiddleware  = require('../middlewares/adminAuth');
const AdminService         = require('../application/admin/AdminService');
const AdminRepository      = require('../repositories/AdminRepository');

// Rate limit extra em login: 5 tentativas por minuto por IP
const loginLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { ok: false, error: 'Muitas tentativas de login. Aguarde 1 minuto.' },
});

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {import('express').Router}
 */
module.exports = function criarAdminRoute(db) {
  const router  = Router();
  const repo    = new AdminRepository(db);
  const service = new AdminService(repo);

  // ── POST /login ──────────────────────────────────────────────
  // Pública. Rate-limited. Retorna token JWT de admin (4h).
  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const { email, senha } = req.body ?? {};
      const resultado = await service.login(email, senha);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      next(err);
    }
  });

  // ── Rotas protegidas — exigem token admin ───────────────────
  router.use(AdminAuthMiddleware.verificar);

  // ── GET /totais ──────────────────────────────────────────────
  router.get('/totais', async (_req, res, next) => {
    try {
      const dados = await service.getTotais();
      res.json({ ok: true, dados });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /usuarios ─────────────────────────────────────────────
  router.get('/usuarios', async (req, res, next) => {
    try {
      const dados = await service.listarUsuarios(req.query);
      res.json({ ok: true, dados, total: dados.length });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /usuarios ────────────────────────────────────────────
  router.post('/usuarios', async (req, res, next) => {
    try {
      const resultado = await service.criarUsuario(req.body ?? {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      next(err);
    }
  });

  // ── DELETE /usuarios/:id ──────────────────────────────────────
  router.delete('/usuarios/:id', async (req, res, next) => {
    try {
      await service.excluirUsuario(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /barbeiros ───────────────────────────────────────────
  router.post('/barbeiros', async (req, res, next) => {
    try {
      const resultado = await service.criarBarbeiro(req.body ?? {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      next(err);
    }
  });

  // ── DELETE /barbeiros/:id ─────────────────────────────────────
  router.delete('/barbeiros/:id', async (req, res, next) => {
    try {
      await service.excluirBarbeiro(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /financeiro ───────────────────────────────────────────
  router.get('/financeiro', async (req, res, next) => {
    try {
      const dados = await service.listarFinanceiro(req.query);
      res.json({ ok: true, dados, total: dados.length });
    } catch (err) {
      next(err);
    }
  });

  // ── PATCH /financeiro/:id ─────────────────────────────────────
  router.patch('/financeiro/:id', async (req, res, next) => {
    try {
      const dados = await service.atualizarPlano(req.params.id, req.body ?? {});
      res.json({ ok: true, dados });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
