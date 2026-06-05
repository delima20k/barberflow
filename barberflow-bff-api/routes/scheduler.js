'use strict';

const express = require('express');
const AuthMiddleware = require('../middlewares/auth');
const SchedulerAdminMiddleware = require('../middlewares/schedulerAdmin');
const { SchedulerController } = require('../controllers/SchedulerController');
const { SchedulerFactory } = require('../application/scheduler/SchedulerFactory');
const { OutboxRelay } = require('../infrastructure/outbox/OutboxRelay');
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { InMemoryQueueService } = require('../infrastructure/queue/InMemoryQueueService');
const { InMemoryDistributedLock } = require('../infrastructure/scheduler/InMemoryDistributedLock');
const { InMemorySchedulerRepository } = require('../infrastructure/scheduler/InMemorySchedulerRepository');
const { RedisDistributedLock } = require('../infrastructure/scheduler/RedisDistributedLock');
const { SupabaseSchedulerRepository } = require('../infrastructure/scheduler/SupabaseSchedulerRepository');
const { SupabaseChatRepository } = require('../infrastructure/chat/SupabaseChatRepository');

let controller;

function buildController(db) {
  if (controller) return controller;
  let redisClient = null;
  let queueService = new InMemoryQueueService();
  let lock = new InMemoryDistributedLock();
  let repository = new InMemorySchedulerRepository();
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis'); // eslint-disable-line global-require
    const { BullMQAdapter } = require('../infrastructure/queue/BullMQAdapter'); // eslint-disable-line global-require
    redisClient = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    queueService = new BullMQAdapter({ redisConnection: redisClient });
    lock = new RedisDistributedLock({ redisClient });
    repository = new SupabaseSchedulerRepository({ supabase: db });
  }
  const outboxRelay = new OutboxRelay({
    outboxRepository: new OutboxRepository({ supabase: db }),
    queueService,
    intervalMs: 5_000,
  });
  const built = SchedulerFactory.build({
    lock,
    repository,
    outboxRelay,
    queueService,
    chatRepository: new SupabaseChatRepository(db),
    instanceId: 'http-admin',
  });
  controller = new SchedulerController({ schedulerService: built.service });
  return controller;
}

module.exports = function schedulerRoute(db) {
  const router = express.Router();
  const ctrl = buildController(db);
  router.use(AuthMiddleware.verificar, SchedulerAdminMiddleware.verificar);
  router.get('/tasks', ctrl.list.bind(ctrl));
  router.post('/tasks/:taskName/trigger', ctrl.trigger.bind(ctrl));
  return router;
};
