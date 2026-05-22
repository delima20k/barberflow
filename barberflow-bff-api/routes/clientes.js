'use strict';

const { Router }     = require('express');
const AuthMiddleware = require('../middlewares/auth');
const GeoController  = require('../controllers/GeoController');
const GeoService     = require('../services/GeoService');
const GeoRepository  = require('../repositories/GeoRepository');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
// Mantem a compatibilidade de clientes legados; /api/v1/geo atende o contexto canonico.
module.exports = function criarClienteRoute(db) {
  const router = Router();
  const geoRepo = new GeoRepository(db);
  const geoSvc  = new GeoService(geoRepo);
  const geoCtrl = new GeoController(geoSvc);

  // Todas as rotas de /clientes exigem autenticação
  router.use(AuthMiddleware.verificar);
  router.patch('/localizacao', geoCtrl.patch.bind(geoCtrl));
  router.get('/localizacao', geoCtrl.get.bind(geoCtrl));

  return router;
};
