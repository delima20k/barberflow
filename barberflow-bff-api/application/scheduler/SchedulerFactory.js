'use strict';

const { TaskRegistry } = require('./TaskRegistry');
const { SchedulerRunner } = require('./SchedulerRunner');
const { SchedulerService } = require('./SchedulerService');
const { SchedulerMetrics } = require('./SchedulerMetrics');
const { ScheduledTask } = require('../../domain/scheduler/entities/ScheduledTask');
const { CronExpression } = require('../../domain/scheduler/value-objects/CronExpression');
const { RetryPolicy } = require('../../domain/scheduler/value-objects/RetryPolicy');
const { OutboxRelayTask } = require('./tasks/OutboxRelayTask');
const { NotificationDigestTask } = require('./tasks/NotificationDigestTask');
const { ChatMessagePurgeTask } = require('./tasks/ChatMessagePurgeTask');
const { StoryCleanupTask } = require('./tasks/StoryCleanupTask');
const { QueuePresenceNudgeTask } = require('./tasks/QueuePresenceNudgeTask');
const { PurgeExpiredChatMessagesUseCase } = require('../chat/PurgeExpiredChatMessagesUseCase');
const { PurgeExpiredStoriesUseCase } = require('../stories/PurgeExpiredStoriesUseCase');

class SchedulerFactory {
  static build({
    lock,
    repository,
    outboxRelay,
    notificationRepository = null,
    queueService = null,
    chatRepository = null,
    instanceId = null,
    barbeariaRepository = null,
    mediaRepository = null,
    r2Gateway = null,
    supabaseStorageGateway = null,
    queuePresenceRepository = null,
    pushService = null,
  }) {
    const registry = new TaskRegistry();
    registry
      .register(SchedulerFactory.#task({
        name: 'messaging.outbox-relay',
        ownerContext: 'messaging',
        cron: '* * * * *',
        timezone: 'UTC',
        timeoutMs: 20_000,
        retryPolicy: new RetryPolicy({ maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 2_000 }),
        handler: new OutboxRelayTask({ outboxRelay }),
        description: 'Relaya eventos do outbox para filas BullMQ.',
      }))
      .register(SchedulerFactory.#task({
        name: 'notifications.digest-flush',
        ownerContext: 'notifications',
        cron: '*/5 * * * *',
        timezone: 'UTC',
        timeoutMs: 30_000,
        retryPolicy: new RetryPolicy({ maxAttempts: 2, baseDelayMs: 1_000, maxDelayMs: 5_000 }),
        handler: new NotificationDigestTask({ notificationRepository, queueService }),
        description: 'Agrupa e libera digests de notificacoes.',
      }));

    // Tarefa de expiração de mensagens: registrada somente quando chatRepository disponível
    if (chatRepository) {
      registry.register(SchedulerFactory.#task({
        name: 'chat.purge-expired-messages',
        ownerContext: 'chat',
        cron: '0 3 * * *', // diariamente às 03:00 UTC
        timezone: 'UTC',
        timeoutMs: 60_000,
        retryPolicy: new RetryPolicy({ maxAttempts: 2, baseDelayMs: 5_000, maxDelayMs: 30_000 }),
        handler: new ChatMessagePurgeTask({
          purgeExpiredChatMessagesUseCase: new PurgeExpiredChatMessagesUseCase({
            chatRepository,
            olderThanDays: 7,
          }),
        }),
        description: 'Remove permanentemente mensagens de chat com mais de 7 dias.',
      }));
    }

    if (barbeariaRepository && mediaRepository && r2Gateway && supabaseStorageGateway) {
      registry.register(SchedulerFactory.#task({
        name: 'media.stories-cleanup',
        ownerContext: 'media',
        cron: '0 * * * *',
        timezone: 'UTC',
        timeoutMs: 120_000,
        retryPolicy: new RetryPolicy({ maxAttempts: 2, baseDelayMs: 5_000, maxDelayMs: 30_000 }),
        handler: new StoryCleanupTask({
          purgeExpiredStoriesUseCase: new PurgeExpiredStoriesUseCase({
            storyRepository:        barbeariaRepository,
            mediaRepository,
            r2Gateway,
            supabaseStorageGateway,
            batchSize: Number(process.env.STORY_CLEANUP_BATCH_SIZE ?? 50),
          }),
        }),
        description: 'Remove stories expirados e arquivos R2 orfaos. Horario.',
      }));
    }

    if (queuePresenceRepository && pushService) {
      registry.register(SchedulerFactory.#task({
        name: 'queue.presence-nudge',
        ownerContext: 'queue',
        cron: '* * * * *',
        timezone: 'UTC',
        timeoutMs: 30_000,
        retryPolicy: new RetryPolicy({ maxAttempts: 2, baseDelayMs: 1_000, maxDelayMs: 5_000 }),
        handler: new QueuePresenceNudgeTask({ queuePresenceRepository, pushService }),
        description: 'Lembrete recorrente (10 min) de presenca para clientes em 1o lugar na fila que ainda nao confirmaram.',
      }));
    }

    const metrics = new SchedulerMetrics();
    const runner = new SchedulerRunner({ registry, lock, repository, metrics, instanceId });
    return { registry, metrics, runner, service: new SchedulerService({ runner, intervalMs: 30_000 }) };
  }

  static #task({ name, ownerContext, cron, timezone, timeoutMs, retryPolicy, handler, description }) {
    const cronResult = CronExpression.create(cron, { timezone });
    if (cronResult.isFail()) throw new Error(cronResult.getError());
    const taskResult = ScheduledTask.create({
      name,
      ownerContext,
      cron: cronResult.getValue(),
      timeoutMs,
      retryPolicy,
      handler,
      description,
      skewProtectionMs: 60_000,
      skipIfLate: true,
    });
    if (taskResult.isFail()) throw new Error(taskResult.getError());
    return taskResult.getValue();
  }
}

module.exports = { SchedulerFactory };
