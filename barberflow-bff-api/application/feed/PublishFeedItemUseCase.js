'use strict';

const { Result } = require('../../domain/shared/Result');
const { FeedItem } = require('../../domain/feed/entities/FeedItem');
const { NewPost } = require('../../domain/feed/events/NewPost');
const { FeedFanoutPolicy } = require('../../config/feed');
const { QUEUES, JOB_TYPES } = require('../../config/queues');

class PublishFeedItemUseCase {
  #feedRepository;
  #outboxRepository;
  #eventPublisher;
  #policy;
  #clock;

  constructor({ feedRepository, outboxRepository, eventPublisher, policy = new FeedFanoutPolicy(), clock = { now: () => new Date() } }) {
    if (!feedRepository) throw new TypeError('PublishFeedItemUseCase: feedRepository obrigatorio.');
    if (!outboxRepository) throw new TypeError('PublishFeedItemUseCase: outboxRepository obrigatorio.');
    this.#feedRepository = feedRepository;
    this.#outboxRepository = outboxRepository;
    this.#eventPublisher = eventPublisher ?? { publish: async () => {} };
    this.#policy = policy;
    this.#clock = clock;
  }

  async execute(command = {}) {
    if (!command.contentHash) return Result.fail('contentHash obrigatorio para anti-spam do feed.');
    const duplicate = await this.#feedRepository.hasRecentContentHash(command.authorId, command.contentHash);
    if (duplicate) return Result.fail('Conteudo duplicado no feed.');
    const posts = await this.#feedRepository.countRecentPostsByAuthor(
      command.authorId,
      this.#policy.postRateWindowSeconds,
    );
    if (posts >= this.#policy.postRateLimit) return Result.fail('Rate limit de posts excedido.');

    const followersCount = await this.#feedRepository.countFollowers(command.authorId);
    const fanoutMode = this.#policy.modeForFollowers(followersCount);
    const itemResult = FeedItem.create({ ...command, fanoutMode, createdAt: this.#clock.now() });
    if (itemResult.isFail()) return itemResult;

    const item = await this.#feedRepository.saveItem(itemResult.getValue());
    await this.#outboxRepository.save({
      eventName: JOB_TYPES.GENERATE_FEED,
      queue: QUEUES.FEED,
      payload: { itemId: item.id, authorId: item.authorId, fanoutMode, followerLimit: this.#policy.writeFanoutFollowerLimit },
    });
    await this.#eventPublisher.publish(new NewPost(item));
    return Result.ok(item.toJSON());
  }
}

module.exports = { PublishFeedItemUseCase };
