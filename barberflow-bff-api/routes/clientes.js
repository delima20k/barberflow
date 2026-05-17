'use strict';

const { Router }     = require('express');
const AuthMiddleware = require('../middlewares/auth');
const GeoRepository  = require('../repositories/GeoRepository');
const GeoService     = require('../services/GeoService');
const GeoController  = require('../controllers/GeoController');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
module.exports = function criarClienteRoute(db) {
  const repo = new GeoRepository(db);
  const svc  = new GeoService(repo);
  const ctrl = new GeoController(svc);

  const router = Router();

  // Todas as rotas de /clientes exigem autenticação
  router.use(AuthMiddleware.verificar);

  router.get('/localizacao',   (req, res) => ctrl.get(req, res));
  router.patch('/localizacao', (req, res) => ctrl.patch(req, res));

  return router;
};
