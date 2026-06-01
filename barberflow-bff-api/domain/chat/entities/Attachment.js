'use strict';

class Attachment {
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static create({ mediaId, variant = 'original', kind = 'media' } = {}) {
    if (!mediaId || typeof mediaId !== 'string') throw new TypeError('Attachment.mediaId obrigatorio.');
    if (!variant || typeof variant !== 'string') throw new TypeError('Attachment.variant obrigatoria.');
    return new Attachment({ mediaId, variant, kind });
  }

  static restore(props) {
    return Attachment.create(props);
  }

  get mediaId() { return this.#props.mediaId; }
  get variant() { return this.#props.variant; }
  get kind() { return this.#props.kind; }

  toJSON() {
    return { mediaId: this.mediaId, variant: this.variant, kind: this.kind };
  }
}

module.exports = { Attachment };
