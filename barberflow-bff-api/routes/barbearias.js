'use strict';

const { Router }          = require('express');
const BarbeariaRepository = require('../repositories/BarbeariaRepository');
const BarbeariaService    = require('../services/BarbeariaService');
const BarbeariaController = require('../controllers/BarbeariaController');
const AuthMiddleware      = require('../middlewares/auth');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
module.exports = function criarBarbeariaRoute(db) {
  const repo = new BarbeariaRepository(db);
  const svc  = new BarbeariaService(repo);
  const ctrl = new BarbeariaController(svc);

  const router = Router();

  // ── Rotas ─────────────────────────────────────────────────────
  // ATENÇÃO: /destaque e /todas devem vir ANTES de /:id para evitar
  // conflito de parâmetro dinâmico (Express resolve em ordem de registro).
  router.patch('/minha/endereco', AuthMiddleware.verificar, ctrl.salvarEndereco.bind(ctrl));
  router.get('/destaque', ctrl.destaque.bind(ctrl));
  router.get('/todas',    ctrl.todas.bind(ctrl));
  router.get('/',         ctrl.proximas.bind(ctrl));

  return router;
};
