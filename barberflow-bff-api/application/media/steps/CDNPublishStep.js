'use strict';

const { BaseMediaStep } = require('./BaseMediaStep');

class CDNPublishStep extends BaseMediaStep {
  #storage;
  #mediaRepository;

  constructor({ storage, mediaRepository }) {
    super();
    if (!storage || typeof storage.putVariant !== 'function') throw new TypeError('CDNPublishStep: storage e obrigatorio');
    if (!mediaRepository || typeof mediaRepository.markPublished !== 'function') throw new TypeError('CDNPublishStep: mediaRepository e obrigatorio');
    this.#storage = storage;
    this.#mediaRepository = mediaRepository;
  }

  async handle(input) {
    for (const variant of input.variants) {
      await this.#storage.putVariant(variant);
    }
    await this.#mediaRepository.markPublished(input.mediaId, input.variants, input.metadata);
    return { ...input, status: 'published' };
  }
}

module.exports = { CDNPublishStep };
