'use strict';

const { Router }          = require('express');
const BarbeariaRepository = require('../repositories/BarbeariaRepository');
const BarbeariaService    = require('../services/BarbeariaService');
const BarbeariaController = require('../controllers/BarbeariaController');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
module.exports = function criarBarbeariaRoute(db) {
  const repo = new BarbeariaRepository(db);
  const svc  = new BarbeariaService(repo);
  const ctrl = new BarbeariaController(svc);

  const router = Router();

  // ── Rotas públicas (sem autenticação) ─────────────────────────
  // ATENÇÃO: /destaque e /todas devem vir ANTES de /:id para evitar
  // conflito de parâmetro dinâmico (Express resolve em ordem de registro).
  router.get('/destaque', ctrl.destaque.bind(ctrl));
  router.get('/todas',    ctrl.todas.bind(ctrl));
  router.get('/',         ctrl.proximas.bind(ctrl));

  return router;
};
