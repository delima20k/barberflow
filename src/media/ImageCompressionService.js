'use strict';

const sharp = require('sharp');
const MediaTelemetry = require('./MediaTelemetry');
const MediaValidator = require('./MediaValidator');
const { CompressionError } = require('./MediaErrors');

class PhotoCompressionStrategy {
  async compress(buffer, { signal, maxWidth = 1600, quality = 78 } = {}) {
    this.#throwIfAborted(signal);
    const data = await sharp(buffer)
      .rotate()
      .withMetadata(false)
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    this.#throwIfAborted(signal);
    return { data, format: 'webp', contentType: 'image/webp', bytes: data.length, animated: false };
  }

  #throwIfAborted(signal) {
    if (signal?.aborted) throw new CompressionError('Compressao cancelada.', { status: 499, code: 'COMPRESSION_ABORTED' });
  }
}

class ScreenshotCompressionStrategy {
  async compress(buffer, { signal, maxWidth = 1800, quality = 88 } = {}) {
    this.#throwIfAborted(signal);
    const data = await sharp(buffer)
      .rotate()
      .withMetadata(false)
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    this.#throwIfAborted(signal);
    if (data.length <= buffer.length) {
      return { data, format: 'png', contentType: 'image/png', bytes: data.length, animated: false };
    }
    const fallback = await sharp(buffer)
      .rotate()
      .withMetadata(false)
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, smartSubsample: true })
      .toBuffer();
    this.#throwIfAborted(signal);
    return { data: fallback, format: 'webp', contentType: 'image/webp', bytes: fallback.length, animated: false };
  }

  #throwIfAborted(signal) {
    if (signal?.aborted) throw new CompressionError('Compressao cancelada.', { status: 499, code: 'COMPRESSION_ABORTED' });
  }
}

class AnimatedImageStrategy {
  async compress(buffer, { signal, contentType = 'image/gif' } = {}) {
    if (signal?.aborted) {
      throw new CompressionError('Compressao cancelada.', { status: 499, code: 'COMPRESSION_ABORTED' });
    }
    return {
      data: buffer,
      format: contentType === 'image/webp' ? 'webp' : 'gif',
      contentType,
      bytes: buffer.length,
      animated: true,
      preserved: true,
    };
  }
}

class ImageCompressionService {
  #validator;
  #telemetry;
  #strategies;

  constructor({ validator = new MediaValidator(), telemetry = new MediaTelemetry(), strategies = {} } = {}) {
    this.#validator = validator;
    this.#telemetry = telemetry;
    this.#strategies = {
      photo: strategies.photo ?? new PhotoCompressionStrategy(),
      screenshot: strategies.screenshot ?? new ScreenshotCompressionStrategy(),
      animated: strategies.animated ?? new AnimatedImageStrategy(),
    };
  }

  async compress(buffer, { contentType = 'image/jpeg', metadata = {}, strategy = null, signal = null } = {}) {
    this.#validator.validateBuffer(buffer);
    this.#throwIfAborted(signal);
    const selected = strategy ?? this.#validator.detectImageStrategy({ buffer, contentType, metadata });
    const compressor = this.#strategies[selected];
    if (!compressor?.compress) {
      throw new CompressionError(`Strategy de compressao desconhecida: ${selected}`, { status: 400 });
    }

    const stage = this.#telemetry.start(`image.${selected}`, { inputBytes: buffer.length, contentType });
    try {
      const result = await compressor.compress(buffer, { signal, contentType, metadata });
      stage.end({ outputBytes: result.bytes, outputFormat: result.format });
      return { ...result, strategy: selected, originalBytes: buffer.length };
    } catch (err) {
      const wrapped = err instanceof CompressionError
        ? err
        : new CompressionError('Falha ao comprimir imagem.', { cause: err });
      stage.fail(wrapped);
      throw wrapped;
    }
  }

  getMetrics() {
    return this.#telemetry.snapshot();
  }

  #throwIfAborted(signal) {
    if (signal?.aborted) throw new CompressionError('Compressao cancelada.', { status: 499, code: 'COMPRESSION_ABORTED' });
  }
}

module.exports = {
  ImageCompressionService,
  PhotoCompressionStrategy,
  ScreenshotCompressionStrategy,
  AnimatedImageStrategy,
};
