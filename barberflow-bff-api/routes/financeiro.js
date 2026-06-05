'use strict';

const { Router } = require('express');
const FinanceiroRepository = require('../repositories/FinanceiroRepository');
const FinanceiroBffService = require('../services/FinanceiroBffService');
const FinanceiroController = require('../controllers/FinanceiroController');
const AuthMiddleware = require('../middlewares/auth');

module.exports = function criarFinanceiroRoute(db) {
  const repo = new FinanceiroRepository(db);
  const service = new FinanceiroBffService(repo);
  const controller = new FinanceiroController(service);

  const router = Router();
  router.use(AuthMiddleware.verificar);

  router.get('/dashboard', controller.dashboard.bind(controller));
  router.get('/barbeiros/:professional_id/extrato', controller.extratoBarbeiro.bind(controller));
  router.post('/pagamentos-barbeiro', controller.confirmarPagamentoBarbeiro.bind(controller));
  router.patch('/taxas-metodo', controller.aplicarTaxaMetodo.bind(controller));

  return router;
};
