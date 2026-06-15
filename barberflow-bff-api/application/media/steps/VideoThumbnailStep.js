'use strict';

const { BaseMediaStep }           = require('./BaseMediaStep');
const { VideoThumbnailExtractor } = require('../../../infrastructure/media/VideoThumbnailExtractor');
const { ImageCompressionService } = require('../../../../src/media/ImageCompressionService');

class VideoThumbnailStep extends BaseMediaStep {
  #extractor;
  #compression;

  constructor({ extractor, compression } = {}) {
    super();
    this.#extractor   = extractor   ?? new VideoThumbnailExtractor();
    this.#compression = compression ?? new ImageCompressionService();
  }

  async handle(input) {
    if (input.metadata.mediaKind !== 'video') return input;

    const jpegBytes = await this.#extractor.extract(input.source.bytes);
    if (!jpegBytes) return input; // frame não extraído — degradação graciosa

    const optimized = await this.#compression.compressVariants(jpegBytes, {
      contentType: 'image/jpeg',
      metadata:    {},
    });

    const variants = optimized.variants.map((v) => VideoThumbnailStep.#variant(input, v));
    return this._next(input, { variants: [...input.variants, ...variants] });
  }

  static #variant(input, variant) {
    const version = variant.version ?? 1;
    return {
      name:        variant.name,
      version,
      bytes:       variant.data ?? variant.bytes,
      contentType: variant.contentType,
      sizeBytes:   variant.sizeBytes ?? (variant.bytes?.length ?? 0),
      width:       variant.width  ?? null,
      height:      variant.height ?? null,
      metadata:    variant.metadata ?? {},
      path:        `${input.context}/${input.mediaId}/${variant.name}/v${version}/${input.mediaId}.webp`,
    };
  }
}

module.exports = { VideoThumbnailStep };
