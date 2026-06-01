'use strict';

const BaseController = require('./BaseController');

/**
 * MediaController - fronteira HTTP do modulo canonico de midia.
 */
class MediaController extends BaseController {
  #service;

  constructor(service) {
    super();
    this.#service = service;
  }

  async presigned(req, res) {
    await this.handle(res, async () => {
      const signed = await this.#service.createSignedUpload(req.user.id, {
        context: req.body?.context ?? req.body?.contexto,
        contentType: req.body?.contentType,
        sizeBytes: req.body?.sizeBytes,
        privacy: req.body?.privacy,
      });
      this.created(res, signed);
    });
  }

  async confirmar(req, res) {
    await this.handle(res, async () => {
      const result = await this.#service.confirmUpload(req.user.id, {
        mediaId: req.body?.mediaId,
        path: req.body?.path,
        context: req.body?.context ?? req.body?.contexto,
        confirmationToken: req.body?.confirmationToken ?? req.body?.token,
        expiresAt: req.body?.expiresAt,
        metadata: req.body?.metadata,
      });
      res.status(202);
      this.success(res, result);
    });
  }

  async acesso(req, res) {
    await this.handle(res, async () => {
      const access = await this.#service.createSignedAccess(
        req.user.id,
        req.params.mediaId,
        String(req.query.variant ?? 'original'),
        req.query.expiresIn,
      );
      this.success(res, access);
    });
  }
}

module.exports = MediaController;
