'use strict';

// =============================================================
// ClienteController.js — Rotas Express para /api/clientes.
// Camada: interfaces
//
// Recebe a requisição, delega ao ClienteService, retorna resposta.
// Sem lógica de negócio — apenas binding HTTP.
//
// Rotas:
//   GET  /api/clientes/publico/:id — perfil público (sem auth)
//   GET  /api/clientes/:id         — buscar cliente por ID
//   PUT  /api/clientes/:id         — atualizar dados do cliente
// =============================================================

const { Router }      = require('express');
const AuthMiddleware  = require('../infra/AuthMiddleware');

/**
 * Cria e retorna o router de clientes com o service injetado.
 * @param {import('../services/ClienteService')} clienteService
 * @returns {import('express').Router}
 */
function criarClienteController(clienteService) {
  const router = Router();

  // ── GET /api/clientes/publico/:id ── (SEM autenticação) ──
  router.get('/publico/:id', async (req, res) => {
    try {
      const perfil = await clienteService.buscarPerfilPublico(req.params.id);
      if (!perfil) return res.status(404).json({ ok: false, error: 'Perfil não encontrado.' });
      res.json({ ok: true, dados: perfil });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // Todas as rotas abaixo exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── GET /api/clientes/:id ─────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const cliente = await clienteService.buscarCliente(req.params.id);
      res.json({ ok: true, dados: cliente.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── PUT /api/clientes/:id ─────────────────────────────────
  router.put('/:id', async (req, res) => {
    try {
      const cliente = await clienteService.atualizarCliente(
        req.params.id,
        req.body,
        req.user.id,
      );
      res.json({ ok: true, dados: cliente.toJSON() });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarClienteController;
