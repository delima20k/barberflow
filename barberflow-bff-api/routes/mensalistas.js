'use strict';

const { Router }           = require('express');
const MensalistaRepository = require('../repositories/MensalistaRepository');
const MensalistaService    = require('../services/MensalistaService');
const MensalistaController = require('../controllers/MensalistaController');
const AuthMiddleware        = require('../middlewares/auth');

/**
 * criarMensalistaRoute — Factory da rota /api/v1/mensalistas.
 *
 * Mantém o padrão de injeção de dependências do BFF:
 * db (SupabaseClient.getInstance()) injetado no momento da criação do app.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {import('express').Router}
 */
module.exports = function criarMensalistaRoute(db) {
  const repo = new MensalistaRepository(db);
  const svc  = new MensalistaService(repo, db);
  const ctrl = new MensalistaController(svc);

  const router = Router();

  // Todas as rotas exigem autenticação via Bearer JWT
  router.use(AuthMiddleware.verificar);

  // ATENÇÃO: rotas literais antes de /:id para evitar conflito no Express
  router.get('/verificar',            ctrl.verificar.bind(ctrl));
  router.get('/clientes-disponiveis', ctrl.clientesDisponiveis.bind(ctrl));
  router.get('/',                     ctrl.listar.bind(ctrl));
  router.post('/',                    ctrl.adicionar.bind(ctrl));
  router.delete('/:id',               ctrl.remover.bind(ctrl));

  return router;
};
