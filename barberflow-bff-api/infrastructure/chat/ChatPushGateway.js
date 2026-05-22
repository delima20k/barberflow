'use strict';

class ChatPushGateway {
  #pushService;

  constructor({ pushService }) {
    if (!pushService) throw new TypeError('ChatPushGateway.pushService obrigatorio.');
    this.#pushService = pushService;
  }

  async notifyMessage(payload) {
    return this.#pushService.enviarMensagemChat(payload);
  }
}

module.exports = { ChatPushGateway };
