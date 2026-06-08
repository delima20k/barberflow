'use strict';

const { Router }           = require('express');
const AuthMiddleware       = require('../middlewares/auth');
const { AdminUserMiddleware } = require('../middlewares/adminUser');
const { R2ConfigService }  = require('../application/admin/R2ConfigService');

// ============================================================
// AdminConfigRoute — endpoints de configuração do sistema.
//
// Todas as rotas exigem:
//   1. AuthMiddleware.verificar    — JWT Supabase válido
//   2. AdminUserMiddleware         — registro ativo em admin_users
//
// Rotas:
//   GET  /r2          — carrega config R2 (secrets mascarados)
//   POST /r2          — salva config R2
//   POST /r2/testar   — testa conexão com o bucket
//   GET  /r2/secret   — gera MEDIA_CONFIRM_SECRET aleatório
// ============================================================

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {import('express').Router}
 */
module.exports = function criarAdminConfigRoute(db) {
  const router        = Router();
  const authMW        = AuthMiddleware.verificar;
  const adminMW       = AdminUserMiddleware.criarVerificador(db);
  const r2ConfigSvc   = new R2ConfigService(db);

  // ── GET /r2 — carregar configuração atual ─────────────────
  router.get('/r2', authMW, adminMW, async (_req, res, next) => {
    try {
      const config = await r2ConfigSvc.carregar();
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /r2 — salvar configuração ────────────────────────
  router.post('/r2', authMW, adminMW, async (req, res, next) => {
    try {
      await r2ConfigSvc.salvar(req.body ?? {});
      res.json({ ok: true, message: 'Configurações salvas com sucesso.' });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
      next(err);
    }
  });

  // ── POST /r2/testar — testar conexão ──────────────────────
  router.post('/r2/testar', authMW, adminMW, async (_req, res, next) => {
    try {
      const resultado = await r2ConfigSvc.testarConexao();
      res.status(resultado.ok ? 200 : 502).json({ ok: resultado.ok, detalhes: resultado.detalhes });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /r2/secret — gerar secret aleatório ───────────────
  router.get('/r2/secret', authMW, adminMW, (_req, res) => {
    const secret = r2ConfigSvc.gerarSecret();
    res.json({ ok: true, secret });
  });

  return router;
};
