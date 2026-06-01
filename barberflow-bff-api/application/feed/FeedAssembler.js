'use strict';

const { FeedQuery } = require('../../domain/feed/value-objects/FeedQuery');
const { ChronologicalStrategy } = require('../../domain/feed/ranking/ChronologicalStrategy');

class FeedAssembler {
  #rankingStrategy;
  #rankingStrategies;
  #sponsoredProvider;
  #suggestionProvider;
  #maxItemsPerAuthor;

  constructor({
    rankingStrategy = new ChronologicalStrategy(),
    rankingStrategies = {},
    sponsoredProvider = { getItems: async () => [] },
    suggestionProvider = { getItems: async () => [] },
    maxItemsPerAuthor = 2,
  } = {}) {
    this.#rankingStrategy = rankingStrategy;
    this.#rankingStrategies = rankingStrategies;
    this.#sponsoredProvider = sponsoredProvider;
    this.#suggestionProvider = suggestionProvider;
    this.#maxItemsPerAuthor = maxItemsPerAuthor;
  }

  async assemble(items, query, filters = {}) {
    const organic = this.#throttleAuthors(this.#deduplicate(this.#filter(items, filters)));
    const ranked = this.#strategyFor(query).rank(organic);
    const organicPage = ranked.slice(0, query.limit);
    const injected = await Promise.all([
      this.#sponsoredProvider.getItems(query),
      this.#suggestionProvider.getItems(query),
    ]);
    const pageItems = this.#deduplicate([...injected.flat(), ...organicPage]).slice(0, query.limit);
    const cursorItem = organicPage.at(-1);
    return {
      items: pageItems,
      nextCursor: cursorItem ? FeedQuery.encodeCursor({ createdAt: cursorItem.createdAt.toISOString(), id: cursorItem.id }) : null,
    };
  }

  #filter(items, { blockedAuthorIds = [], hiddenItemIds = [] }) {
    const blocked = new Set(blockedAuthorIds);
    const hidden = new Set(hiddenItemIds);
    return items.filter(item => !blocked.has(item.authorId) && !hidden.has(item.id));
  }

  #deduplicate(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = item.contentHash || `${item.sourceType}:${item.sourceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  #throttleAuthors(items) {
    const authorCounts = new Map();
    return items.filter((item) => {
      if (item.sponsored || item.suggestion) return true;
      const nextCount = (authorCounts.get(item.authorId) ?? 0) + 1;
      authorCounts.set(item.authorId, nextCount);
      return nextCount <= this.#maxItemsPerAuthor;
    });
  }

  #strategyFor(query) {
    return this.#rankingStrategies[query.strategy] ?? this.#rankingStrategy;
  }
}

module.exports = { FeedAssembler };
