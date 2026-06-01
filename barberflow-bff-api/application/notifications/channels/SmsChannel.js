'use strict';

const { DeliveryChannel } = require('../../../domain/notifications/ports/DeliveryChannel');

class SmsChannel extends DeliveryChannel {
  #smsProvider;

  constructor({ smsProvider }) {
    super();
    if (!smsProvider) throw new TypeError('SmsChannel.smsProvider obrigatorio');
    this.#smsProvider = smsProvider;
  }

  get name() { return 'sms'; }

  async send({ notification, rendered }) {
    const result = await this.#smsProvider.send({
      userId: notification.userId,
      body: rendered?.body ?? '',
      data: rendered?.data ?? {},
    });
    return { ok: result?.ok !== false, channel: this.name, providerMessageId: result?.providerMessageId };
  }
}

module.exports = { SmsChannel };
