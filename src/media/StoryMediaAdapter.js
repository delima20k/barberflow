'use strict';

const MediaValidator = require('./MediaValidator');
const { ValidationError } = require('./MediaErrors');

class StoryMediaAdapter {
  #validator;
  #imageCompression;
  #videoProcessor;
  #uploadService;

  constructor({ validator = new MediaValidator(), imageCompression, videoProcessor, uploadService } = {}) {
    if (!imageCompression?.compress) throw new TypeError('[StoryMediaAdapter] imageCompression.compress e obrigatorio.');
    if (!videoProcessor?.inspect) throw new TypeError('[StoryMediaAdapter] videoProcessor.inspect e obrigatorio.');
    if (!uploadService?.uploadDirect && !uploadService?.upload) {
      throw new TypeError('[StoryMediaAdapter] uploadService e obrigatorio.');
    }
    this.#validator = validator;
    this.#imageCompression = imageCompression;
    this.#videoProcessor = videoProcessor;
    this.#uploadService = uploadService;
  }

  async prepare({ buffer, file = null, ownerId, barbershopId, contentType, caption = '', metadata = {}, signal = null } = {}) {
    const source = buffer ?? file?.buffer;
    this.#validator.validateBuffer(source);
    this.#validator.validateUploadRequest({ contexto: 'stories', ownerId, contentType, sizeBytes: source.length });
    const kind = this.#validator.detectKind({ contentType });

    if (kind === 'image') {
      const compressed = await this.#imageCompression.compress(source, { contentType, metadata, signal });
      const uploaded = await this.#upload({ buffer: compressed.data, ownerId, contentType: compressed.contentType, metadata: { ...metadata, caption, barbershopId, adapter: 'story', strategy: compressed.strategy }, signal });
      return this.#formatOutput({ uploaded, ownerId, barbershopId, kind, contentType: compressed.contentType, originalBytes: source.length, processedBytes: compressed.bytes, caption, metadata });
    }

    if (kind === 'video') {
      const info = await this.#videoProcessor.inspect(source, { contexto: 'stories', metadata, signal });
      const thumbnail = await this.#videoProcessor.extractThumbnail(source, { contexto: 'stories', metadata, signal });
      const uploaded = await this.#upload({ buffer: source, ownerId, contentType, metadata: { ...metadata, caption, barbershopId, adapter: 'story', durationSeconds: info.durationSeconds }, signal });
      return this.#formatOutput({ uploaded, ownerId, barbershopId, kind, contentType, originalBytes: source.length, processedBytes: source.length, caption, metadata: { ...metadata, thumbnail } });
    }

    throw new ValidationError(`Tipo de story nao suportado: ${contentType}`, { status: 415 });
  }

  async #upload({ buffer, ownerId, contentType, metadata, signal }) {
    if (this.#uploadService.upload) {
      return this.#uploadService.upload({ buffer, contexto: 'stories', ownerId, contentType, metadata, signal });
    }
    return this.#uploadService.uploadDirect({ body: buffer, contentType, signal });
  }

  #formatOutput({ uploaded, ownerId, barbershopId, kind, contentType, originalBytes, processedBytes, caption, metadata }) {
    return {
      mediaId: uploaded.id ?? uploaded.mediaId ?? null,
      ownerId,
      contexto: 'stories',
      kind,
      aspect: kind === 'video' ? '9:16' : '9:16',
      original: { path: uploaded.path ?? null, contentType, sizeBytes: originalBytes },
      variants: [{ type: 'story-main', bytes: processedBytes, contentType }],
      access: { publicUrl: uploaded.publicUrl ?? null, signedUrlExpiresAt: uploaded.expiresAt ?? null },
      metadata: { ...metadata, barbershopId, caption },
    };
  }
}

module.exports = StoryMediaAdapter;
