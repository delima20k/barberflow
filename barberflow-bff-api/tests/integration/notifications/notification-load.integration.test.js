'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { InMemoryQueueService } = require('../../../infrastructure/queue/InMemoryQueueService');
const { NotificationHandler } = require('../../../application/handlers/NotificationHandler');
const { NotificationService } = require('../../../application/notifications/NotificationService');
const { NotificationRouter } = require('../../../application/notifications/NotificationRouter');
const { TemplateRenderer } = require('../../../application/notifications/TemplateRenderer');
const { DigestAggregationStrategy } = require('../../../application/notifications/strategies/DigestAggregationStrategy');
const { InMemoryNotificationRepository } = require('../../../infrastructure/notifications/InMemoryNotificationRepository');
const { SandboxPushProviderAdapter } = require('../../../infrastructure/notifications/SandboxPushProviderAdapter');
const { PushChannel } = require('../../../application/notifications/channels/PushChannel');
const { QUEUES, JOB_TYPES, QUEUE_PRIORITY } = require('../../../config/queues');

describe('Notification load queue', () => {
  it('deve processar 10k notificacoes enfileiradas com DLQ vazia', async () => {
    const repository = new InMemoryNotificationRepository();
    await repository.saveTemplate({
      id: 'bulk.alert',
      category: 'system',
      channels: { push: { title: { 'pt-BR': 'Aviso' }, body: { 'pt-BR': 'Mensagem {{idx}}' } } },
    });
    const provider = new SandboxPushProviderAdapter();
    const service = new NotificationService({
      notificationRepository: repository,
      queueService: null,
      router: new NotificationRouter({
        presenceLink: { isOnline: () => false },
        digestStrategy: new DigestAggregationStrategy({ threshold: 5 }),
        clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
      }),
      templateRenderer: new TemplateRenderer(),
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });
    const queue = new InMemoryQueueService();
    queue.registerHandler(new NotificationHandler({
      notificationService: service,
      channelMap: { push: new PushChannel({ pushProvider: provider, notificationRepository: repository }) },
    }));

    for (let i = 0; i < 10_000; i++) {
      const notification = await repository.createNotification({
        userId: `user-${i}`,
        templateId: 'bulk.alert',
        category: 'system',
        priority: i < 100 ? 'high' : 'default',
        channels: ['push'],
        dedupeKey: `bulk-${i}`,
        data: { idx: i },
        locale: 'pt-BR',
        createdAt: new Date('2026-05-22T12:00:00.000Z'),
      });
      await queue.enqueue(
        i < 100 ? QUEUES.NOTIFICATIONS_HIGH : QUEUES.NOTIFICATIONS_DEFAULT,
        JOB_TYPES.SEND_NOTIFICATION,
        { notificationId: notification.id, channels: ['push'] },
        { priority: i < 100 ? QUEUE_PRIORITY.HIGH : QUEUE_PRIORITY.DEFAULT, maxAttempts: 1, jobId: notification.id },
      );
    }

    const start = Date.now();
    await queue.processUntilEmpty(QUEUES.NOTIFICATIONS_HIGH, 2);
    await queue.processUntilEmpty(QUEUES.NOTIFICATIONS_DEFAULT, 2);
    const elapsedMs = Date.now() - start;

    const highMetrics = await queue.getMetrics(QUEUES.NOTIFICATIONS_HIGH);
    const defaultMetrics = await queue.getMetrics(QUEUES.NOTIFICATIONS_DEFAULT);
    const highDlq = await queue.getDLQ(QUEUES.NOTIFICATIONS_HIGH);
    const defaultDlq = await queue.getDLQ(QUEUES.NOTIFICATIONS_DEFAULT);

    assert.deepEqual({
      processed: highMetrics.processed + defaultMetrics.processed,
      sent: provider.sent.length,
      dlq: highDlq.length + defaultDlq.length,
      throughputOk: elapsedMs < 5_000,
    }, {
      processed: 10_000,
      sent: 10_000,
      dlq: 0,
      throughputOk: true,
    });
  });
});
