'use strict';

const { BaseMediaStep }        = require('./BaseMediaStep');
const { MediaPolicyCatalog }   = require('../../../config/media');

class MimeValidationStep extends BaseMediaStep {
  async handle(input) {
    const detected = MimeValidationStep.#detect(input?.source?.bytes);
    const declared = String(input?.source?.contentType ?? '').toLowerCase();
    const policy = MediaPolicyCatalog.context(input.context);
    if (!detected || detected.contentType !== declared) {
      throw new Error('MimeValidationStep: MIME real nao confere com o declarado');
    }
    if (!policy?.mimes.includes(detected.contentType) || input.source.sizeBytes > policy.maxBytes) {
      throw new Error('MimeValidationStep: midia fora dos limites configurados');
    }
    return this._next(input, { metadata: { mediaKind: detected.kind, detectedMime: detected.contentType } });
  }

  static #detect(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 4) return null;
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { contentType: 'image/png', kind: 'image' };
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { contentType: 'image/jpeg', kind: 'image' };
    }
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
      return { contentType: 'image/webp', kind: 'image' };
    }
    if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
      return { contentType: 'video/mp4', kind: 'video' };
    }
    return null;
  }
}

module.exports = { MimeValidationStep };
