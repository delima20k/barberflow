'use strict';

// ================================================================
// clienteBff.js — Namespace /api/v1/cliente para o app cliente.
//
// Responsabilidade: agrupar todas as rotas do app cliente na BFF.
// Auth: rotas que exigem JWT devem usar AuthMiddleware.verificar.
//
// Rotas existentes:
//   GET  /health  — health check público do namespace cliente
//
// Rotas futuras (adicionar aqui conforme roadmap):
//   GET  /perfil            — dados do perfil do cliente autenticado
//   PATCH /perfil           — atualizar perfil do cliente autenticado
//   GET  /historico         — histórico de agendamentos do cliente
//   GET  /favoritos         — lista de favoritos do cliente
//   POST /favoritos/:id     — adicionar favorito
//   DELETE /favoritos/:id   — remover favorito
// ================================================================

const { Router }    = require('express');
const ApiResponse   = require('../utils/ApiResponse');

const router = Router();

// GET /api/v1/cliente/health — health check público do namespace cliente
router.get('/health', (_req, res) => {
  ApiResponse.success(res, { status: 'up', service: 'barberflow-client-bff' });
});

module.exports = router;
