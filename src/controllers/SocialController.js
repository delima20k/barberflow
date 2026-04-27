'use strict';

// =============================================================
// SocialController.js — Rotas Express para /api/social.
// Camada: interfaces
//
// Rotas:
//   GET    /api/social/stories/:barbeariaId              — listar stories
//   POST   /api/social/stories                           — criar story
//   DELETE /api/social/stories/:id                       — deletar story
//   POST   /api/social/stories/:id/comentarios           — comentar
//   POST   /api/social/profissionais/:id/like            — toggle like
//   POST   /api/social/profissionais/:id/favoritar       — toggle favorito
//   GET    /api/social/favoritos                         — favoritos do usuário
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/SocialService')} socialService
 * @returns {import('express').Router}
 */
function criarSocialController(socialService) {
  const router = Router();
  router.use(AuthMiddleware.verificar);

  // ── GET /api/social/stories/:barbeariaId ──────────────────────────────────
  router.get('/stories/:barbeariaId', async (req, res) => {
    try {
      const stories = await socialService.listarStories(req.params.barbeariaId);
      res.json({ ok: true, dados: stories });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/social/stories ──────────────────────────────────────────────
  router.post('/stories', async (req, res) => {
    try {
      const { barbershop_id, ...resto } = req.body;
      const story = await socialService.criarStory(req.user.id, barbershop_id, resto);
      res.status(201).json({ ok: true, dados: story });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── DELETE /api/social/stories/:id ───────────────────────────────────────
  router.delete('/stories/:id', async (req, res) => {
    try {
      await socialService.deletarStory(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/social/stories/:id/comentarios ──────────────────────────────
  router.post('/stories/:id/comentarios', async (req, res) => {
    try {
      const { texto } = req.body;
      if (!texto) return res.status(400).json({ ok: false, error: 'Campo "texto" obrigatório.' });
      const comentario = await socialService.comentarStory(req.params.id, req.user.id, texto);
      res.status(201).json({ ok: true, dados: comentario });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/social/profissionais/:id/like ───────────────────────────────
  router.post('/profissionais/:id/like', async (req, res) => {
    try {
      const resultado = await socialService.toggleLike(req.params.id, req.user.id);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/social/profissionais/:id/favoritar ──────────────────────────
  router.post('/profissionais/:id/favoritar', async (req, res) => {
    try {
      const resultado = await socialService.toggleFavorite(req.params.id, req.user.id);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/social/favoritos ─────────────────────────────────────────────
  router.get('/favoritos', async (req, res) => {
    try {
      const favoritos = await socialService.listarFavoritos(req.user.id);
      res.json({ ok: true, dados: favoritos });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarSocialController;
