'use strict';

const { DeliveryChannel } = require('../../../domain/notifications/ports/DeliveryChannel');

class InAppChannel extends DeliveryChannel {
  #notificationRepository;

  constructor({ notificationRepository }) {
    super();
    if (!notificationRepository) throw new TypeError('InAppChannel.notificationRepository obrigatorio');
    this.#notificationRepository = notificationRepository;
  }

  get name() { return 'in_app'; }

  async send({ notification, rendered }) {
    await this.#notificationRepository.saveInApp({
      notificationId: notification.id,
      userId: notification.userId,
      title: rendered?.title ?? '',
      body: rendered?.body ?? '',
      data: rendered?.data ?? {},
    });
    return { ok: true, channel: this.name };
  }
}

module.exports = { InAppChannel };
