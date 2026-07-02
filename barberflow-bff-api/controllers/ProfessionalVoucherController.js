'use strict';

const BaseController = require('./BaseController');

class ProfessionalVoucherController extends BaseController {
  #service;

  constructor(service) {
    super();
    this.#service = service;
  }

  async validar(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.validar(req.body);
      this.success(res, dados);
    });
  }
}

module.exports = ProfessionalVoucherController;
