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

  async uploadCompressedStory(req, res) {
    await this.handle(res, async () => {
      const result = await this.#service.uploadCompressedStory(req.user.id, {
        bytes: req.body,
        contentType: req.headers['content-type'],
        sizeBytes: Buffer.isBuffer(req.body) ? req.body.length : 0,
        metadata: MediaController.#metadataHeader(req.headers['x-media-metadata']),
      });
      this.created(res, result);
    });
  }

  static #metadataHeader(headerValue) {
    if (!headerValue || typeof headerValue !== 'string' || headerValue.length > 2048) return {};
    try {
      const parsed = JSON.parse(headerValue);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
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

  async toggleLike(req, res) {
    await this.handle(res, async () => {
      if (typeof this.#service.toggleLike !== 'function') {
        throw this._erro('Funcionalidade nao disponivel.', 503);
      }
      const result = await this.#service.toggleLike(req.user.id, String(req.params.mediaId ?? '').trim());
      this.success(res, result);
    });
  }

  async salvarThumb(req, res) {
    await this.handle(res, async () => {
      if (typeof this.#service.salvarThumb !== 'function') {
        throw this._erro('Funcionalidade nao disponivel.', 503);
      }
      const result = await this.#service.salvarThumb(
        req.user.id,
        String(req.params.mediaId ?? '').trim(),
        req.body?.thumbnailBase64,
      );
      this.success(res, result);
    });
  }

  async excluir(req, res) {
    await this.handle(res, async () => {
      if (typeof this.#service.deleteByMediaId !== 'function') {
        throw this._erro('Funcionalidade nao disponivel.', 503);
      }
      const result = await this.#service.deleteByMediaId(req.user.id, String(req.params.mediaId ?? '').trim());
      this.success(res, result);
    });
  }
}

module.exports = MediaController;
