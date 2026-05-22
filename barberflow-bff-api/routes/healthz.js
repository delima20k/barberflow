'use strict';

const { Router }        = require('express');
const HealthzController = require('../controllers/HealthzController');

/**
 * healthz.js — Rotas de health check com verificações reais de dependências.
 *
 * Montagem em app.js:
 *   app.use('/health', healthzRoute({ supabase: _db, redis: redisConn }));
 *
 * Endpoints:
 *   GET /health/live  → liveness (sempre 200 se o processo responde)
 *   GET /health/ready → readiness (200 ou 503 conforme dependências)
 *
 * @param {{ supabase?: object, redis?: object }} [deps={}]
 * @returns {import('express').Router}
 */
function healthzRoute({ supabase = null, redis = null } = {}) {
  const router = Router();
  const ctrl   = new HealthzController({ supabase, redis });

  router.get('/live',  ctrl.live.bind(ctrl));
  router.get('/ready', ctrl.ready.bind(ctrl));

  return router;
}

module.exports = healthzRoute;
