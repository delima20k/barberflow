'use strict';

const { Result } = require('../../domain/shared/Result');
const { FeedQuery } = require('../../domain/feed/value-objects/FeedQuery');

class GetFeedUseCase {
  #feedRepository;
  #feedAssembler;
  #feedCache;

  constructor({ feedRepository, feedAssembler, feedCache }) {
    if (!feedRepository) throw new TypeError('GetFeedUseCase: feedRepository obrigatorio.');
    if (!feedAssembler) throw new TypeError('GetFeedUseCase: feedAssembler obrigatorio.');
    if (!feedCache) throw new TypeError('GetFeedUseCase: feedCache obrigatorio.');
    this.#feedRepository = feedRepository;
    this.#feedAssembler = feedAssembler;
    this.#feedCache = feedCache;
  }

  async execute(command) {
    const queryResult = FeedQuery.create(command);
    if (queryResult.isFail()) return queryResult;
    const query = queryResult.getValue();
    try {
      const cached = await this.#feedCache.get(query);
      if (cached) return Result.ok(cached);
      const items = await this.#feedRepository.listPage(query);
      const filters = await this.#feedRepository.listFilters(query.userId);
      const page = await this.#feedAssembler.assemble(items, query, filters);
      const serialized = { items: page.items.map(item => item.toJSON()), nextCursor: page.nextCursor };
      await this.#feedCache.set(query, serialized);
      return Result.ok(serialized);
    } catch (err) {
      return Result.fail(err.message);
    }
  }
}

module.exports = { GetFeedUseCase };
