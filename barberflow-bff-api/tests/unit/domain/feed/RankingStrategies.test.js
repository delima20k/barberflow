'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { FeedItem } = require('../../../../domain/feed/entities/FeedItem');
const { ChronologicalStrategy } = require('../../../../domain/feed/ranking/ChronologicalStrategy');
const { EngagementScoreStrategy } = require('../../../../domain/feed/ranking/EngagementScoreStrategy');
const { PersonalizedStrategy } = require('../../../../domain/feed/ranking/PersonalizedStrategy');

class FeedDataset {
  static fixed() {
    return [
      FeedItem.restore({ id: 'c', authorId: 'author-2', createdAt: '2026-05-22T10:00:00.000Z', likesCount: 1, viewsCount: 12, affinityScore: 0.1 }),
      FeedItem.restore({ id: 'a', authorId: 'author-1', createdAt: '2026-05-22T10:02:00.000Z', likesCount: 2, viewsCount: 4, affinityScore: 0.5 }),
      FeedItem.restore({ id: 'b', authorId: 'author-3', createdAt: '2026-05-22T10:01:00.000Z', likesCount: 9, viewsCount: 8, affinityScore: 0.9 }),
    ];
  }

  static ids(items) {
    return items.map(item => item.id);
  }
}

describe('ChronologicalStrategy', () => {
  it('mantem snapshot cronologico com id como desempate estavel', () => {
    const ranked = new ChronologicalStrategy().rank(FeedDataset.fixed());
    assert.deepEqual(FeedDataset.ids(ranked), ['a', 'b', 'c']);
  });
});

describe('EngagementScoreStrategy', () => {
  it('mantem snapshot de engajamento com dataset fixo', () => {
    const ranked = new EngagementScoreStrategy().rank(FeedDataset.fixed());
    assert.deepEqual(FeedDataset.ids(ranked), ['b', 'c', 'a']);
  });
});

describe('PersonalizedStrategy', () => {
  it('mantem snapshot personalizado sem perder recencia', () => {
    const ranked = new PersonalizedStrategy().rank(FeedDataset.fixed());
    assert.deepEqual(FeedDataset.ids(ranked), ['b', 'a', 'c']);
  });
});
