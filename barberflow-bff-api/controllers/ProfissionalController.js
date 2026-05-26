'use strict';

const BaseController = require('./BaseController');

/**
 * ProfissionalController - endpoints BFF do perfil publico profissional.
 */
class ProfissionalController extends BaseController {
  #service;

  constructor(service) {
    super();
    this.#service = service;
  }

  async perfilPublico(req, res) {
    await this.handle(res, async () => {
      const dto = await this.#service.buscarPerfilPublico(req.params.id);
      if (this.etag(req, res, dto)) return;
      this.cachePublico(res, 60, 300);
      this.success(res, dto);
    });
  }

  async atualizarMeuPerfil(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const dto = await this.#service.atualizarPerfilPublico(req.user.id, req.body ?? {});
      this.success(res, dto);
    });
  }

  async mensagemBarbearia(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const dto = await this.#service.iniciarMensagemBarbearia(req.user.id, req.params.id);
      this.created(res, dto);
    });
  }

  async portfolio(req, res) {
    await this.handle(res, async () => {
      const dto = await this.#service.listarPortfolioPublico(req.params.id, req.query ?? {});
      if (this.etag(req, res, dto)) return;
      this.cachePublico(res, 60, 300);
      this.success(res, dto);
    });
  }

  async atualizarPortfolioImagem(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const dto = await this.#service.atualizarPortfolioImagem(req.user.id, req.params.imageId, req.body ?? {});
      this.success(res, dto);
    });
  }

  async removerPortfolioImagem(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const dto = await this.#service.removerPortfolioImagem(req.user.id, req.params.imageId);
      this.success(res, dto);
    });
  }

  async listarMeuPortfolio(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const dto = await this.#service.listarMeuPortfolio(req.user.id, req.query ?? {});
      this.success(res, dto.items, { total: dto.total });
    });
  }

  async uploadPortfolioImagem(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const dto = await this.#service.uploadPortfolioImagem(
        req.user.id,
        req.body,
        req.headers['content-type'] ?? '',
      );
      this.created(res, dto);
    });
  }
}

module.exports = ProfissionalController;
