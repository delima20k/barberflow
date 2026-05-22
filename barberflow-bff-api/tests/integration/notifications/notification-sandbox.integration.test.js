'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { NotificationService } = require('../../../application/notifications/NotificationService');
const { NotificationRouter } = require('../../../application/notifications/NotificationRouter');
const { TemplateRenderer } = require('../../../application/notifications/TemplateRenderer');
const { DigestAggregationStrategy } = require('../../../application/notifications/strategies/DigestAggregationStrategy');
const { InMemoryNotificationRepository } = require('../../../infrastructure/notifications/InMemoryNotificationRepository');
const { SandboxPushProviderAdapter } = require('../../../infrastructure/notifications/SandboxPushProviderAdapter');
const { PushChannel } = require('../../../application/notifications/channels/PushChannel');
const { InAppChannel } = require('../../../application/notifications/channels/InAppChannel');
const { QUEUES } = require('../../../config/queues');

describe('NotificationService sandbox provider', () => {
  it('deve criar, rotear, enfileirar e entregar notificacao ate canal in_app e push sandbox', async () => {
    const repository = new InMemoryNotificationRepository();
    await repository.saveTemplate({
      id: 'queue.arrived',
      category: 'queue',
      channels: {
        push: { title: { 'pt-BR': 'Cliente {{clienteNome}}' }, body: { 'pt-BR': '{{clienteNome}} chegou.' } },
        in_app: { title: { 'pt-BR': 'Fila' }, body: { 'pt-BR': '{{clienteNome}} chegou.' } },
      },
    });
    await repository.savePreferences({ userId: 'user-1', channelsByCategory: { queue: { push: true, in_app: true } } });

    const enqueued = [];
    const service = new NotificationService({
      notificationRepository: repository,
      queueService: { enqueue: async (queue, type, payload, options) => enqueued.push({ queue, type, payload, options }) },
      router: new NotificationRouter({
        presenceLink: { isOnline: () => false },
        digestStrategy: new DigestAggregationStrategy({ threshold: 3 }),
        clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
      }),
      templateRenderer: new TemplateRenderer(),
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });

    const created = await service.notify({
      userId: 'user-1',
      templateId: 'queue.arrived',
      dedupeKey: 'fila-1',
      data: { clienteNome: 'Ana' },
      priority: 'high',
      channels: ['push', 'in_app'],
    });

    const provider = new SandboxPushProviderAdapter();
    const push = new PushChannel({ pushProvider: provider, notificationRepository: repository });
    const inApp = new InAppChannel({ notificationRepository: repository });
    const delivery = await service.deliver({
      notificationId: created.notificationId,
      channels: ['push', 'in_app'],
      channelMap: { push, in_app: inApp },
    });

    assert.deepEqual({
      queue: enqueued[0].queue,
      deliveries: delivery.deliveries.length,
      sandboxSent: provider.sent.length,
      inAppSaved: repository.inAppMessages.length,
      dlq: repository.events.filter(e => e.eventName === 'NotificationDeliveryFailed').length,
    }, {
      queue: QUEUES.NOTIFICATIONS_HIGH,
      deliveries: 2,
      sandboxSent: 1,
      inAppSaved: 1,
      dlq: 0,
    });
  });
});
