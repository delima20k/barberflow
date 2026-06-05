'use strict';

const BaseController = require('./BaseController');

/**
 * FinanceiroController expõe os endpoints BFF da dashboard financeira.
 */
class FinanceiroController extends BaseController {
  #service;

  constructor(service) {
    super();
    this.#service = service;
  }

  async dashboard(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.dashboard(req.user.id, req.query);
      this.success(res, dados);
    });
  }

  async extratoBarbeiro(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.extratoBarbeiro(req.user.id, req.params.professional_id, req.query);
      this.success(res, dados);
    });
  }

  async aplicarTaxaMetodo(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.aplicarTaxaMetodo(req.user.id, req.body);
      this.success(res, dados);
    });
  }

  async confirmarPagamentoBarbeiro(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.confirmarPagamentoBarbeiro(req.user.id, req.body);
      this.success(res, dados);
    });
  }

  async confirmarAcertoSemanal(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.confirmarAcertoSemanal(req.user.id, req.body);
      this.success(res, dados);
    });
  }
}

module.exports = FinanceiroController;
