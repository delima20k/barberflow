'use strict';

const { Router }       = require('express');
const HealthController = require('../controllers/HealthController');

const router = Router();
const ctrl   = new HealthController();

// GET /health  (montado em /api/health e /api/v1/health pelo app.js)
router.get('/', ctrl.handle.bind(ctrl));

module.exports = router;
