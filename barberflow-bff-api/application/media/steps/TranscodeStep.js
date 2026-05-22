'use strict';

const { BaseMediaStep }      = require('./BaseMediaStep');
const { MediaPolicyCatalog } = require('../../../config/media');

class TranscodeStep extends BaseMediaStep {
  #transcoder;

  constructor({ transcoder }) {
    super();
    this.#transcoder = transcoder ?? { transcode: async () => [] };
  }

  async handle(input) {
    const original = TranscodeStep.#original(input);
    const derived = input.metadata.mediaKind === 'video'
      ? await this.#transcoder.transcode(input)
      : [];
    return this._next(input, {
      variants: [...input.variants, original, ...derived.map(variant => TranscodeStep.#complete(input, variant))],
    });
  }

  static #original(input) {
    const ext = String(input.source.path).split('.').pop() || 'bin';
    return TranscodeStep.#complete(input, {
      name: 'original',
      contentType: input.source.contentType,
      bytes: input.source.bytes,
      ext,
    });
  }

  static #complete(input, variant) {
    const catalog = MediaPolicyCatalog.variant(variant.name);
    const version = variant.version ?? catalog?.version ?? 1;
    const ext = variant.ext ?? (variant.contentType === 'video/mp4' ? 'mp4' : 'bin');
    return {
      ...variant,
      version,
      sizeBytes: variant.bytes.length,
      path: variant.path ?? `${input.context}/${input.mediaId}/${variant.name}/v${version}/${input.mediaId}.${ext}`,
    };
  }
}

module.exports = { TranscodeStep };
