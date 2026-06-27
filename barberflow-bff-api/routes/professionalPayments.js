'use strict';

const { Router } = require('express');
const AuthMiddleware = require('../middlewares/auth');
const ProfessionalPaymentRepository = require('../repositories/ProfessionalPaymentRepository');
const ProfessionalPaymentService = require('../services/ProfessionalPaymentService');
const ProfessionalPaymentController = require('../controllers/ProfessionalPaymentController');
const AsaasClient = require('../infrastructure/payments/AsaasClient');

module.exports = function criarProfessionalPaymentsRoute(db) {
  const repo = new ProfessionalPaymentRepository(db);
  const asaas = new AsaasClient();
  const service = new ProfessionalPaymentService(repo, asaas);
  const controller = new ProfessionalPaymentController(service);

  const router = Router();

  router.post('/asaas/webhook', controller.webhookAsaas.bind(controller));

  router.use(AuthMiddleware.verificar);
  router.post('/trial', controller.ativarTrial.bind(controller));
  router.post('/cobrancas', controller.criarCobranca.bind(controller));
  router.get('/cobrancas/:payment_id', controller.buscarCobranca.bind(controller));

  return router;
};
