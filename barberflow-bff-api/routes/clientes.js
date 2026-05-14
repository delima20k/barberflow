'use strict';

const { Router }      = require('express');
const AuthMiddleware  = require('../middlewares/auth');
const SupabaseClient  = require('../utils/SupabaseClient');
const GeoRepository   = require('../repositories/GeoRepository');
const GeoService      = require('../services/GeoService');
const GeoController   = require('../controllers/GeoController');

const db   = SupabaseClient.getInstance();
const repo = new GeoRepository(db);
const svc  = new GeoService(repo);
const ctrl = new GeoController(svc);

const router = Router();

// Todas as rotas de /clientes exigem autenticação
router.use(AuthMiddleware.verificar);

router.get('/localizacao',   (req, res) => ctrl.get(req, res));
router.patch('/localizacao', (req, res) => ctrl.patch(req, res));

module.exports = router;
