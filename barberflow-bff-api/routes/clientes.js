'use strict';

const { Router }     = require('express');
const AuthMiddleware = require('../middlewares/auth');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
// Rotas de geolocalização foram migradas para /api/v1/geo (routes/geo.js).
module.exports = function criarClienteRoute(_db) {
  const router = Router();

  // Todas as rotas de /clientes exigem autenticação
  router.use(AuthMiddleware.verificar);

  return router;
};
