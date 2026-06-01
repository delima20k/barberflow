'use strict';

const { BaseMediaStep } = require('./BaseMediaStep');

class VirusScanStep extends BaseMediaStep {
  #scanner;

  constructor({ scanner }) {
    super();
    if (!scanner || typeof scanner.scan !== 'function') throw new TypeError('VirusScanStep: scanner e obrigatorio');
    this.#scanner = scanner;
  }

  async handle(input) {
    const result = await this.#scanner.scan(input.source.bytes, input);
    if (result?.infected) {
      throw new Error(`VirusScanStep: arquivo bloqueado${result.signature ? ` (${result.signature})` : ''}`);
    }
    return this._next(input, { metadata: { virusScan: { status: 'clean' } } });
  }
}

module.exports = { VirusScanStep };
