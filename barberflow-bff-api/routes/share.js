'use strict';

const express              = require('express');
const { Router }           = express;
const BarbeariaRepository  = require('../repositories/BarbeariaRepository');
const BarbeariaShareController = require('../controllers/BarbeariaShareController');
const { OpenGraphHtmlBuilder } = require('../infrastructure/share/OpenGraphHtmlBuilder');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Rota pública de compartilhamento (Open Graph) — montada FORA de /api,
// sem auth e sem rate-limit de JSON. Ex.: GET /b/:id
module.exports = function criarShareRoute(db) {
  const repo    = new BarbeariaRepository(db);
  const builder = new OpenGraphHtmlBuilder();
  const ctrl    = new BarbeariaShareController({
    repo,
    builder,
    appBaseUrl:  process.env.APP_CLIENTE_URL || 'https://app.barberflow.live',
    supabaseUrl: process.env.SUPABASE_URL || '',
  });

  const router = Router();
  router.get('/:id', ctrl.handle);
  return router;
};
