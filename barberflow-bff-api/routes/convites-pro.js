'use strict';

const { Router }         = require('express');
const AuthMiddleware     = require('../middlewares/auth');
const ConviteRepository  = require('../repositories/ConviteRepository');
const ConviteService     = require('../services/ConviteService');
const ConviteController  = require('../controllers/ConviteController');

module.exports = function criarConviteProRoute(db, deps = {}) {
  const repo       = deps.repo       ?? new ConviteRepository(db);
  const service    = deps.service    ?? new ConviteService(repo);
  const controller = deps.controller ?? new ConviteController(service);

  const router = Router();

  router.get(
    '/me/barbearias-vinculadas',
    AuthMiddleware.verificar,
    controller.listarBarbeariasVinculadas.bind(controller),
  );

  router.get(
    '/me/convites',
    AuthMiddleware.verificar,
    controller.listarConvites.bind(controller),
  );

  router.post(
    '/me/convites/:invite_id/aceitar',
    AuthMiddleware.verificar,
    controller.aceitarConvite.bind(controller),
  );

  router.post(
    '/me/convites/:invite_id/recusar',
    AuthMiddleware.verificar,
    controller.recusarConvite.bind(controller),
  );

  return router;
};
