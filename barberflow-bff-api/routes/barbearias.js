'use strict';

const { Router, raw }     = require('express');
const BarbeariaRepository = require('../repositories/BarbeariaRepository');
const BarbeariaService    = require('../services/BarbeariaService');
const BarbeariaMediaService = require('../services/BarbeariaMediaService');
const BarbeariaController = require('../controllers/BarbeariaController');
const AuthMiddleware      = require('../middlewares/auth');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
module.exports = function criarBarbeariaRoute(db) {
  const repo = new BarbeariaRepository(db);
  const svc  = new BarbeariaService(repo);
  const mediaSvc = new BarbeariaMediaService(repo);
  const ctrl = new BarbeariaController(svc, mediaSvc);

  const router = Router();

  // ── Rotas ─────────────────────────────────────────────────────
  // ATENÇÃO: /destaque e /todas devem vir ANTES de /:id para evitar
  // conflito de parâmetro dinâmico (Express resolve em ordem de registro).
  router.patch('/minha/endereco', AuthMiddleware.verificar, ctrl.salvarEndereco.bind(ctrl));
  router.patch(
    '/minha/imagem',
    AuthMiddleware.verificar,
    raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
    ctrl.salvarImagem.bind(ctrl),
  );
  router.get('/destaque', ctrl.destaque.bind(ctrl));
  router.get('/todas',    ctrl.todas.bind(ctrl));
  router.get('/',         ctrl.proximas.bind(ctrl));

  return router;
};
