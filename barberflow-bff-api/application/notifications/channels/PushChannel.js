'use strict';

const { DeliveryChannel } = require('../../../domain/notifications/ports/DeliveryChannel');

class PushChannel extends DeliveryChannel {
  #pushProvider;
  #notificationRepository;

  constructor({ pushProvider, notificationRepository = null }) {
    super();
    if (!pushProvider) throw new TypeError('PushChannel.pushProvider obrigatorio');
    this.#pushProvider = pushProvider;
    this.#notificationRepository = notificationRepository;
  }

  get name() { return 'push'; }

  async send({ notification, rendered }) {
    const result = await this.#pushProvider.send({
      userId: notification.userId,
      title: rendered?.title ?? '',
      body: rendered?.body ?? '',
      data: { ...(rendered?.data ?? {}), notificationId: notification.id },
      priority: notification.priority,
    });
    if (result?.permanentFailure && result.endpoint && this.#notificationRepository?.suppressEndpoint) {
      await this.#notificationRepository.suppressEndpoint(result.endpoint, 'permanent_failure');
    }
    return { ok: result?.ok !== false, channel: this.name, providerMessageId: result?.providerMessageId, error: result?.error };
  }
}

module.exports = { PushChannel };
