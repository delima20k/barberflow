'use strict';

const { BaseMediaStep }          = require('./BaseMediaStep');
const { ImageCompressionService } = require('../../../../src/media/ImageCompressionService');

class ThumbnailStep extends BaseMediaStep {
  #compression;

  constructor({ compression = new ImageCompressionService() } = {}) {
    super();
    this.#compression = compression;
  }

  async handle(input) {
    if (input.metadata.mediaKind !== 'image') return input;
    const optimized = await this.#compression.compressVariants(input.source.bytes, {
      contentType: input.source.contentType,
      metadata: input.metadata,
    });
    const variants = optimized.variants.map((variant) => ThumbnailStep.#variant(input, variant));
    return this._next(input, {
      variants: [...input.variants, ...variants],
      metadata: { blurPlaceholder: optimized.blurPlaceholder },
    });
  }

  static #variant(input, variant) {
    const version = variant.version ?? 1;
    return {
      name: variant.name,
      version,
      bytes: variant.data ?? variant.bytes,
      contentType: variant.contentType,
      sizeBytes: variant.sizeBytes ?? variant.bytes,
      width: variant.width ?? null,
      height: variant.height ?? null,
      metadata: variant.metadata ?? {},
      path: `${input.context}/${input.mediaId}/${variant.name}/v${version}/${input.mediaId}.webp`,
    };
  }
}

module.exports = { ThumbnailStep };
