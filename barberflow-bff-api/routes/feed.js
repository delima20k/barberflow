'use strict';

const { Router } = require('express');
const AuthMiddleware = require('../middlewares/auth');
const FeedController = require('../controllers/FeedController');
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { DomainEventPublisher } = require('../infrastructure/events/DomainEventPublisher');
const { SupabaseFeedRepository } = require('../infrastructure/feed/SupabaseFeedRepository');
const { FeedCacheProvider } = require('../infrastructure/feed/FeedCacheProvider');
const { FeedCacheInvalidationSubscriber } = require('../infrastructure/feed/FeedCacheInvalidationSubscriber');
const { FeedAssembler } = require('../application/feed/FeedAssembler');
const { GetFeedUseCase } = require('../application/feed/GetFeedUseCase');
const { PublishFeedItemUseCase } = require('../application/feed/PublishFeedItemUseCase');
const { ChangeFeedRelationshipUseCase } = require('../application/feed/ChangeFeedRelationshipUseCase');
const { PersonalizedStrategy } = require('../domain/feed/ranking/PersonalizedStrategy');
const { ChronologicalStrategy } = require('../domain/feed/ranking/ChronologicalStrategy');
const { EngagementScoreStrategy } = require('../domain/feed/ranking/EngagementScoreStrategy');
const { FeedFanoutPolicy } = require('../config/feed');

module.exports = function criarFeedRoute(db, deps = {}) {
  const feedRepository = deps.feedRepository ?? new SupabaseFeedRepository(db);
  const feedCache = deps.feedCache ?? FeedCacheProvider.create();
  const eventPublisher = deps.eventPublisher ?? DomainEventPublisher.getInstance();
  (deps.cacheInvalidationSubscriber ?? new FeedCacheInvalidationSubscriber({ feedCache })).register(eventPublisher);
  const policy = deps.policy ?? new FeedFanoutPolicy();
  const assembler = deps.assembler ?? new FeedAssembler({
    rankingStrategy: new PersonalizedStrategy(),
    rankingStrategies: {
      chronological: new ChronologicalStrategy(),
      engagement: new EngagementScoreStrategy(),
      personalized: new PersonalizedStrategy(),
    },
    maxItemsPerAuthor: policy.viralThrottlePerPage,
  });
  const controller = new FeedController({
    getFeedUseCase: deps.getFeedUseCase ?? new GetFeedUseCase({ feedRepository, feedAssembler: assembler, feedCache }),
    publishFeedItemUseCase: deps.publishFeedItemUseCase ?? new PublishFeedItemUseCase({
      feedRepository,
      outboxRepository: deps.outboxRepository ?? new OutboxRepository({ supabase: db }),
      eventPublisher,
      policy,
    }),
    changeFeedRelationshipUseCase: deps.changeFeedRelationshipUseCase ?? new ChangeFeedRelationshipUseCase({
      feedRepository,
      eventPublisher,
    }),
  });
  const router = Router();
  router.get('/', AuthMiddleware.verificar, controller.timeline.bind(controller));
  router.post('/posts', AuthMiddleware.verificar, controller.publish.bind(controller));
  router.post('/authors/:authorId/block', AuthMiddleware.verificar, controller.block.bind(controller));
  router.delete('/authors/:authorId/follow', AuthMiddleware.verificar, controller.unfollow.bind(controller));
  return router;
};
