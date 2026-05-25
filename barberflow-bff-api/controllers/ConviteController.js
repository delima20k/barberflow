'use strict';

const BaseController = require('./BaseController');

class ConviteController extends BaseController {
  #service;

  /** @param {import('../services/ConviteService')} service */
  constructor(service) {
    super();
    this.#service = service;
  }

  async listarConvites(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const lista = await this.#service.listarConvites(req.user.id);
      this.success(res, lista, { total: lista.length });
    });
  }

  async aceitarConvite(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const resultado = await this.#service.aceitarConvite(req.user.id, req.params.invite_id);
      this.success(res, resultado);
    });
  }

  async recusarConvite(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const resultado = await this.#service.recusarConvite(req.user.id, req.params.invite_id);
      this.success(res, resultado);
    });
  }
}

module.exports = ConviteController;
