// =============================================================
// UserController.js — Rotas Express para /api/users.
// Camada: interfaces
//
// Rotas:
//   GET /api/users/search?term=...&limit=...&offset=...&role=...
//                        [&barbershopId=...&professionalId=...]
//   GET /api/users/favorites-modal?barbershopId=...&professionalId=...
//   GET /api/users/:id       — perfil público por UUID
//   GET /api/users/email/:e  — busca por e-mail (requer auth)
// =============================================================

const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * @param {import('../services/UserService')} userService
 * @returns {import('express').Router}
 */
function criarUserController(userService) {
  const router = Router();

  // ── GET /api/users/search ─────────────────────────────────
  // Busca unificada: por nome, email ou nome da barbearia.
  // Sem term + barbershopId/professionalId → retorna favoritos.
  // DEVE vir antes de /:id.
  router.get('/search', AuthMiddleware.verificar, async (req, res) => {
    try {
      const term           = String(req.query.term           ?? '').trim();
      const role           = req.query.role           ? String(req.query.role).trim()           : null;
      const barbershopId   = req.query.barbershopId   ? String(req.query.barbershopId).trim()   : null;
      const professionalId = req.query.professionalId ? String(req.query.professionalId).trim() : null;
      const limit          = Math.min(Number(req.query.limit)  || 20, 50);
      const offset         = Math.max(Number(req.query.offset) || 0,   0);

      const resultado = await userService.searchUsers({
        term, role, limit, offset, barbershopId, professionalId,
      });

      res.json({ ok: true, dados: resultado, total: resultado.length });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/users/favorites-modal ───────────────────────
  // Retorna clientes favoritos para o modal de cadeiras.
  // DEVE vir antes de /:id.
  router.get('/favorites-modal', AuthMiddleware.verificar, async (req, res) => {
    try {
      const barbershopId   = String(req.query.barbershopId   ?? '').trim();
      const professionalId = String(req.query.professionalId ?? '').trim();

      if (!barbershopId || !professionalId) {
        return res.status(400).json({
          ok: false,
          error: 'Parâmetros "barbershopId" e "professionalId" são obrigatórios.',
        });
      }

      const resultado = await userService.getClientesFavoritosModal(
        barbershopId, professionalId
      );
      res.json({ ok: true, dados: resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/users/:id ────────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const perfil = await userService.buscarPerfilPublico(req.params.id);
      res.json({ ok: true, dados: perfil });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/users/email/:email ───────────────────────────
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

