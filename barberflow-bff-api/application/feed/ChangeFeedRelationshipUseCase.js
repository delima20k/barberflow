'use strict';

const { Result } = require('../../domain/shared/Result');
const { FeedItem } = require('../../domain/feed/entities/FeedItem');
const { FeedRelationshipChanged } = require('../../domain/feed/events/FeedRelationshipChanged');

class ChangeFeedRelationshipUseCase {
  #feedRepository;
  #eventPublisher;

  constructor({ feedRepository, eventPublisher }) {
    if (!feedRepository) throw new TypeError('ChangeFeedRelationshipUseCase: feedRepository obrigatorio.');
    this.#feedRepository = feedRepository;
    this.#eventPublisher = eventPublisher ?? { publish: async () => {} };
  }

  async block({ userId, authorId }) {
    const validated = this.#validate(userId, authorId);
    if (validated.isFail()) return validated;
    await this.#feedRepository.blockAuthor(userId, authorId);
    await this.#eventPublisher.publish(FeedRelationshipChanged.block(userId, authorId));
    return Result.ok();
  }

  async unfollow({ userId, authorId }) {
    const validated = this.#validate(userId, authorId);
    if (validated.isFail()) return validated;
    await this.#feedRepository.unfollow(userId, authorId);
    await this.#eventPublisher.publish(FeedRelationshipChanged.unfollow(userId, authorId));
    return Result.ok();
  }

  #validate(userId, authorId) {
    if (!FeedItem.UUID.test(userId) || !FeedItem.UUID.test(authorId)) return Result.fail('userId e authorId devem ser UUID.');
    if (userId === authorId) return Result.fail('Autor e usuario devem ser diferentes.');
    return Result.ok();
  }
}

module.exports = { ChangeFeedRelationshipUseCase };
