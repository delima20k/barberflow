'use strict';

const { Router } = require('express');
const ProfessionalVoucherRepository = require('../repositories/ProfessionalVoucherRepository');
const ProfessionalVoucherService = require('../services/ProfessionalVoucherService');
const ProfessionalVoucherController = require('../controllers/ProfessionalVoucherController');

module.exports = function criarProfessionalVouchersRoute(db) {
  const repo = new ProfessionalVoucherRepository(db);
  const service = new ProfessionalVoucherService(repo);
  const controller = new ProfessionalVoucherController(service);

  const router = Router();

  router.post('/validate', controller.validar.bind(controller));

  return router;
};
