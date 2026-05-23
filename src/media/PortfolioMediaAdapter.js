'use strict';

const MediaValidator = require('./MediaValidator');
const { ValidationError } = require('./MediaErrors');

class PortfolioMediaAdapter {
  #validator;
  #imageCompression;
  #uploadService;

  constructor({ validator = new MediaValidator(), imageCompression, uploadService } = {}) {
    if (!imageCompression?.compress) throw new TypeError('[PortfolioMediaAdapter] imageCompression.compress e obrigatorio.');
    if (!uploadService?.uploadDirect && !uploadService?.upload) {
      throw new TypeError('[PortfolioMediaAdapter] uploadService e obrigatorio.');
    }
    this.#validator = validator;
    this.#imageCompression = imageCompression;
    this.#uploadService = uploadService;
  }

  async prepare({ buffer, file = null, ownerId, barbershopId, contentType, title = '', tags = [], sortOrder = 0, metadata = {}, signal = null } = {}) {
    const source = buffer ?? file?.buffer;
    this.#validator.validateBuffer(source);
    this.#validator.validateUploadRequest({ contexto: 'portfolio', ownerId, contentType, sizeBytes: source.length });
    const kind = this.#validator.detectKind({ contentType });
    if (kind !== 'image') throw new ValidationError(`Portfolio aceita apenas imagem nesta fase: ${contentType}`, { status: 415 });

    const compressed = await this.#imageCompression.compress(source, {
      contentType,
      metadata: { ...metadata, strategyOverride: metadata.strategyOverride ?? 'photo' },
      signal,
    });
    const uploaded = await this.#upload({
      buffer: compressed.data,
      ownerId,
      contentType: compressed.contentType,
      metadata: { ...metadata, barbershopId, title, tags, sortOrder, adapter: 'portfolio', strategy: compressed.strategy },
      signal,
    });

    return {
      mediaId: uploaded.id ?? uploaded.mediaId ?? null,
      ownerId,
      contexto: 'portfolio',
      kind: 'image',
      aspect: '4:5',
      original: { path: uploaded.path ?? null, contentType, sizeBytes: source.length },
      variants: [{ type: 'portfolio-main', bytes: compressed.bytes, contentType: compressed.contentType }],
      access: { publicUrl: uploaded.publicUrl ?? null, signedUrlExpiresAt: uploaded.expiresAt ?? null },
      metadata: { ...metadata, barbershopId, title, tags, sortOrder },
    };
  }

  async #upload({ buffer, ownerId, contentType, metadata, signal }) {
    if (this.#uploadService.upload) {
      return this.#uploadService.upload({ buffer, contexto: 'portfolio', ownerId, contentType, metadata, signal });
    }
    return this.#uploadService.uploadDirect({ body: buffer, contentType, signal });
  }
}

module.exports = PortfolioMediaAdapter;
