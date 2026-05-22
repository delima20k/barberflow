'use strict';

const sharp                  = require('sharp');
const { BaseMediaStep }      = require('./BaseMediaStep');
const { MediaPolicyCatalog } = require('../../../config/media');

class ThumbnailStep extends BaseMediaStep {
  async handle(input) {
    if (input.metadata.mediaKind !== 'image') return input;
    const variants = await Promise.all(['thumb_sm', 'thumb_md'].map(async (name) => {
      const config = MediaPolicyCatalog.variant(name);
      const bytes = await sharp(input.source.bytes)
        .rotate()
        .resize({ width: config.width, withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer();
      return ThumbnailStep.#variant(input, name, bytes, 'image/webp', config.version, 'webp');
    }));
    return this._next(input, { variants: [...input.variants, ...variants] });
  }

  static #variant(input, name, bytes, contentType, version, ext) {
    return {
      name,
      version,
      bytes,
      contentType,
      sizeBytes: bytes.length,
      path: `${input.context}/${input.mediaId}/${name}/v${version}/${input.mediaId}.${ext}`,
    };
  }
}

module.exports = { ThumbnailStep };
