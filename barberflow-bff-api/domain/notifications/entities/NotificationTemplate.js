'use strict';

const { Result } = require('../../shared/Result');

class NotificationTemplate {
  #props;

  constructor(props) {
    this.#props = Object.freeze({
      id: props.id,
      category: props.category,
      defaultLocale: props.defaultLocale ?? 'pt-BR',
      channels: Object.freeze({ ...(props.channels ?? {}) }),
    });
    Object.freeze(this);
  }

  static create(props = {}) {
    if (!props.id) return Result.fail('NotificationTemplate.id obrigatorio');
    if (!props.category) return Result.fail('NotificationTemplate.category obrigatorio');
    if (!props.channels || Object.keys(props.channels).length === 0) return Result.fail('NotificationTemplate.channels obrigatorio');
    return Result.ok(new NotificationTemplate(props));
  }

  get id() { return this.#props.id; }
  get category() { return this.#props.category; }
  get defaultLocale() { return this.#props.defaultLocale; }
  get channels() { return this.#props.channels; }

  getChannelTemplate(channel) {
    return this.channels[channel] ?? null;
  }

  toJSON() {
    return {
      id: this.id,
      category: this.category,
      defaultLocale: this.defaultLocale,
      channels: this.channels,
    };
  }
}

module.exports = { NotificationTemplate };
