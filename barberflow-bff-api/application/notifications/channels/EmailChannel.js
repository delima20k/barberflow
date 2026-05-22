'use strict';

const { DeliveryChannel } = require('../../../domain/notifications/ports/DeliveryChannel');

class EmailChannel extends DeliveryChannel {
  #emailProvider;

  constructor({ emailProvider }) {
    super();
    if (!emailProvider) throw new TypeError('EmailChannel.emailProvider obrigatorio');
    this.#emailProvider = emailProvider;
  }

  get name() { return 'email'; }

  async send({ notification, rendered }) {
    const result = await this.#emailProvider.send({
      userId: notification.userId,
      subject: rendered?.title ?? '',
      body: rendered?.body ?? '',
      data: rendered?.data ?? {},
    });
    return { ok: result?.ok !== false, channel: this.name, providerMessageId: result?.providerMessageId };
  }
}

module.exports = { EmailChannel };
