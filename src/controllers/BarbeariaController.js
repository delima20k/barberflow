'use strict';

// =============================================================
// BarbeariaController.js — Rotas Express para /api/barbearias.
// Camada: interfaces
//
// Recebe a requisição, delega ao BarbeariaService, retorna resposta.
// Sem lógica de negócio — apenas binding HTTP.
//
// Rotas:
//   GET  /api/barbearias                     — listar próximas (lat, lng, raio)
//   GET  /api/barbearias/favoritas            — barbearias favoritas do usuário
//   GET  /api/barbearias/:id                  — buscar barbearia por ID
//   GET  /api/barbearias/:id/servicos         — listar serviços da barbearia
//   POST /api/barbearias/:id/interacao        — registrar interação (like, favorite, visit)
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * Cria e retorna o router de barbearias com o service injetado.
 * @param {import('../services/BarbeariaService')} barbeariaService
 * @returns {import('express').Router}
 */
function criarBarbeariaController(barbeariaService) {
  const router = Router();

  // Todas as rotas exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── GET /api/barbearias ───────────────────────────────────
  // Query params: lat (obrigatório), lng (obrigatório), raio (km, opcional)
  router.get('/', async (req, res) => {
    try {
      const lat   = parseFloat(req.query.lat);
      const lng   = parseFloat(req.query.lng);
      const raio  = req.query.raio ? parseFloat(req.query.raio) : 5;

      if (isNaN(lat) || isNaN(lng))
        return res.status(400).json({ ok: false, error: 'Parâmetros lat e lng são obrigatórios.' });

      const resultados = await barbeariaService.listarProximas(lat, lng, raio);

      res.json({
        ok:    true,
        total: resultados.length,
        dados: resultados.map(({ barbearia, distanciaKm, raw }) => ({
          ...barbearia.toJSON(),
          distancia_km: Math.round(distanciaKm * 10) / 10,
          // Campos extras não mapeados na entidade
          rating_avg:   raw.rating_avg,
          rating_count: raw.rating_count,
          is_open:      raw.is_open,
          logo_path:    raw.logo_path,
          slug:         raw.slug,
        })),
      });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/barbearias/:id ───────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const barbearia = await barbeariaService.buscarBarbearia(req.params.id);
      res.json({ ok: true, dados: barbearia.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/barbearias/:id/servicos ──────────────────────
  router.get('/:id/servicos', async (req, res) => {
    try {
      const servicos = await barbeariaService.listarServicos(req.params.id);
      res.json({ ok: true, dados: servicos });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/barbearias/favoritas ─────────────────────────
  // Precisa vir antes de /:id para não ser capturado como ID
  router.get('/favoritas', async (req, res) => {
    try {
      const favoritas = await barbeariaService.listarFavoritas(req.user.id);
      res.json({ ok: true, dados: favoritas });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/barbearias/:id/interacao ────────────────────
  router.post('/:id/interacao', async (req, res) => {
    try {
      const { type } = req.body;
      if (!type) return res.status(400).json({ ok: false, error: 'Campo "type" obrigatório.' });
      const resultado = await barbeariaService.registrarInteracao(req.params.id, req.user.id, type);
      res.json({ ok: true, dados: resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarBarbeariaController;
