'use strict';

const sharp             = require('sharp');
const { BaseMediaStep } = require('./BaseMediaStep');

class MetadataExtractStep extends BaseMediaStep {
  #duplicateFinder;

  constructor({ duplicateFinder }) {
    super();
    this.#duplicateFinder = duplicateFinder ?? { findByPerceptualHash: async () => null };
  }

  async handle(input) {
    if (input.metadata.mediaKind !== 'image') return input;
    const image = sharp(input.source.bytes, { failOn: 'warning' }).rotate();
    const [metadata, hash] = await Promise.all([
      image.metadata(),
      MetadataExtractStep.#perceptualHash(input.source.bytes),
    ]);
    const duplicate = await this.#duplicateFinder.findByPerceptualHash(hash, input.ownerId);
    return this._next(input, {
      metadata: {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        perceptualHash: hash,
        duplicateOf: duplicate?.id ?? null,
      },
    });
  }

  static async #perceptualHash(bytes) {
    const { data } = await sharp(bytes)
      .greyscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bits = '';
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        bits += data[(row * 9) + col] > data[(row * 9) + col + 1] ? '1' : '0';
      }
    }
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  }
}

module.exports = { MetadataExtractStep };
