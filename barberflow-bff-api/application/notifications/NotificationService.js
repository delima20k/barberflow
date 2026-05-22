'use strict';

const { QUEUES, JOB_TYPES, QUEUE_PRIORITY } = require('../../config/queues');
const { Notification } = require('../../domain/notifications/entities/Notification');
const { NotificationPreferences } = require('../../domain/notifications/entities/NotificationPreferences');
const {
  NotificationDeliveryTracked,
  NotificationDeliveryFailed,
  NotificationOpened,
  NotificationClicked,
} = require('../../domain/notifications/events/NotificationEvents');

class NotificationService {
  #repository;
  #queueService;
  #router;
  #templateRenderer;
  #clock;
  #dedupeWindowSeconds;

  constructor({
    notificationRepository,
    queueService,
    router,
    templateRenderer,
    clock = { now: () => new Date() },
    dedupeWindowSeconds = 900,
  }) {
    if (!notificationRepository) throw new TypeError('NotificationService.notificationRepository obrigatorio');
    if (!router) throw new TypeError('NotificationService.router obrigatorio');
    if (!templateRenderer) throw new TypeError('NotificationService.templateRenderer obrigatorio');
    this.#repository = notificationRepository;
    this.#queueService = queueService;
    this.#router = router;
    this.#templateRenderer = templateRenderer;
    this.#clock = clock;
    this.#dedupeWindowSeconds = dedupeWindowSeconds;
  }

  async notify(cmd) {
    const template = await this.#repository.getTemplate(cmd.templateId);
    if (!template) throw new Error(`Template nao encontrado: ${cmd.templateId}`);
    if (cmd.dedupeKey && await this.#repository.hasRecentDedup({
      userId: cmd.userId,
      templateId: cmd.templateId,
      dedupeKey: cmd.dedupeKey,
      windowSeconds: cmd.dedupeWindowSeconds ?? this.#dedupeWindowSeconds,
      now: this.#clock.now(),
    })) {
      return { deduplicated: true, notificationId: null };
    }

    const result = Notification.create({
      userId: cmd.userId,
      templateId: cmd.templateId,
      category: cmd.category ?? template.category,
      priority: cmd.priority ?? 'default',
      channels: cmd.channels ?? Object.keys(template.channels),
      dedupeKey: cmd.dedupeKey,
      digestKey: cmd.digestKey,
      data: cmd.data ?? {},
      locale: cmd.locale ?? template.defaultLocale,
      createdAt: this.#clock.now(),
    });
    if (result.isFail()) throw new Error(result.getError());
    const notification = await this.#repository.createNotification(result.getValue().toJSON());
    await this.#repository.recordDedup(notification);

    const preferences = await this.#preferencesFor(notification.userId);
    const route = this.#router.route({ notification, preferences });
    if (route.digestChannels.length) {
      await this.#repository.addToDigest(notification, route.digestChannels);
      return { notificationId: notification.id, route, queued: false, digest: true };
    }
    if (route.delayedChannels.length) {
      await this.#repository.deferNotification(notification, route.delayedChannels);
    }
    if (route.immediateChannels.length && this.#queueService) {
      const queue = notification.isHighPriority() ? QUEUES.NOTIFICATIONS_HIGH : QUEUES.NOTIFICATIONS_DEFAULT;
      await this.#queueService.enqueue(
        queue,
        JOB_TYPES.SEND_NOTIFICATION,
        { notificationId: notification.id, channels: route.immediateChannels },
        {
          jobId: notification.id,
          priority: notification.isHighPriority() ? QUEUE_PRIORITY.HIGH : QUEUE_PRIORITY.DEFAULT,
          maxAttempts: 5,
        },
      );
    }
    return { notificationId: notification.id, route, queued: route.immediateChannels.length > 0 };
  }

  async deliver({ notificationId, channels, channelMap }) {
    const notification = await this.#repository.getNotification(notificationId);
    if (!notification) throw new Error(`Notification nao encontrada: ${notificationId}`);
    const template = await this.#repository.getTemplate(notification.templateId);
    if (!template) throw new Error(`Template nao encontrado: ${notification.templateId}`);
    const rendered = this.#templateRenderer.render({ template, notification, locale: notification.locale });
    const deliveries = [];

    for (const channelName of channels ?? notification.channels) {
      const channel = channelMap[channelName];
      if (!channel) throw new Error(`Canal nao configurado: ${channelName}`);
      const result = await channel.send({ notification, rendered: rendered[channelName] ?? {} });
      deliveries.push(result);
      await this.#repository.trackDelivery(notification.id, channelName, result);
      const EventClass = result.ok ? NotificationDeliveryTracked : NotificationDeliveryFailed;
      await this.#repository.recordEvent(new EventClass(notification.id, { channel: channelName, result }).toJSON());
    }

    await this.#repository.markDelivered(notification.id);
    return { notificationId: notification.id, deliveries };
  }

  async trackOpen({ notificationId, userId, channel }) {
    await this.#repository.recordEvent(new NotificationOpened(notificationId, { userId, channel }).toJSON());
    return { ok: true };
  }

  async trackClick({ notificationId, userId, channel, url }) {
    await this.#repository.recordEvent(new NotificationClicked(notificationId, { userId, channel, url }).toJSON());
    return { ok: true };
  }

  async #preferencesFor(userId) {
    return await this.#repository.getPreferences(userId) ?? NotificationPreferences.allowAll(userId);
  }
}

module.exports = { NotificationService };
