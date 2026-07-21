'use strict';

const { Router } = require('express');
const ProfessionalVoucherRepository = require('../repositories/ProfessionalVoucherRepository');
const ProfessionalVoucherService = require('../services/ProfessionalVoucherService');
const ProfessionalVoucherController = require('../controllers/ProfessionalVoucherController');
const RateLimiterMiddleware = require('../middlewares/rateLimiter');

module.exports = function criarProfessionalVouchersRoute(db, {
  repository = null,
  voucherRateLimiter = RateLimiterMiddleware.landingVoucher,
} = {}) {
  const repo = repository ?? new ProfessionalVoucherRepository(db);
  const service = new ProfessionalVoucherService(repo);
  const controller = new ProfessionalVoucherController(service);

  const router = Router();

  router.get('/availability', controller.disponibilidade.bind(controller));
  router.post('/issue', voucherRateLimiter, controller.emitir.bind(controller));
  router.post('/validate', controller.validar.bind(controller));

  return router;
};
