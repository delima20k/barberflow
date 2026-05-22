'use strict';

const { PushProvider } = require('../../domain/notifications/ports/PushProvider');

class WebPushProviderAdapter extends PushProvider {
  #pushService;

  constructor({ pushService }) {
    super();
    if (!pushService) throw new TypeError('WebPushProviderAdapter.pushService obrigatorio');
    this.#pushService = pushService;
  }

  get name() { return 'web_push'; }

  async send({ userId, title, body, data, priority }) {
    if (typeof this.#pushService.enviarParaUsuario === 'function') {
      const result = await this.#pushService.enviarParaUsuario({ userId, title, body, data, priority });
      return { ok: result.enviados > 0, providerMessageId: null, invalidas: result.invalidas };
    }
    return { ok: false, error: 'pushService.enviarParaUsuario indisponivel' };
  }
}

module.exports = { WebPushProviderAdapter };
