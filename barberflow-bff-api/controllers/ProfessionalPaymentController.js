'use strict';

const BaseController = require('./BaseController');

class ProfessionalPaymentController extends BaseController {
  #service;

  constructor(service) {
    super();
    this.#service = service;
  }

  async criarCobranca(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.criarCobranca(req.user, req.body, { ip: req.ip });
      this.created(res, dados);
    });
  }

  async buscarCobranca(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.buscarCobranca(req.user, req.params.payment_id);
      this.success(res, dados);
    });
  }

  async ativarTrial(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.ativarTrial(req.user);
      this.created(res, dados);
    });
  }

  async webhookAsaas(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.receberWebhook(req.headers, req.body);
      this.success(res, dados);
    });
  }
}

module.exports = ProfessionalPaymentController;
