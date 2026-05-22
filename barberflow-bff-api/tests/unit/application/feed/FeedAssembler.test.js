'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { FeedItem } = require('../../../../domain/feed/entities/FeedItem');
const { FeedQuery } = require('../../../../domain/feed/value-objects/FeedQuery');
const { ChronologicalStrategy } = require('../../../../domain/feed/ranking/ChronologicalStrategy');
const { FeedAssembler } = require('../../../../application/feed/FeedAssembler');
const { FeedCache } = require('../../../../infrastructure/feed/FeedCache');
const { MemoryCache } = require('../../../../infrastructure/cache/MemoryCache');
const { FeedCacheInvalidationSubscriber } = require('../../../../infrastructure/feed/FeedCacheInvalidationSubscriber');
const { DomainEventPublisher } = require('../../../../infrastructure/events/DomainEventPublisher');
const { NewPost } = require('../../../../domain/feed/events/NewPost');
const { FeedRelationshipChanged } = require('../../../../domain/feed/events/FeedRelationshipChanged');
const { ChangeFeedRelationshipUseCase } = require('../../../../application/feed/ChangeFeedRelationshipUseCase');

class FeedAssemblerDataset {
  static items() {
    return [
      FeedItem.restore({ id: 'post-z', authorId: 'viral', createdAt: '2026-05-22T12:00:00.000Z', contentHash: 'dup-1' }),
      FeedItem.restore({ id: 'post-y', authorId: 'viral', createdAt: '2026-05-22T11:59:00.000Z', contentHash: 'dup-2' }),
      FeedItem.restore({ id: 'post-x', authorId: 'regular', createdAt: '2026-05-22T11:58:00.000Z', contentHash: 'dup-1' }),
    ];
  }
}

describe('FeedAssembler', () => {
  it('aplica dedupe, throttle viral e injeta patrocinado sem duplicar fonte', () => {
    const assembler = new FeedAssembler({
      rankingStrategy: new ChronologicalStrategy(),
      maxItemsPerAuthor: 1,
      sponsoredProvider: { getItems: async () => [FeedItem.restore({ id: 'ad-1', authorId: 'sponsor', createdAt: '2026-05-22T12:01:00.000Z', sponsored: true })] },
    });

    return assembler.assemble(FeedAssemblerDataset.items(), FeedQuery.create({ userId: 'viewer', limit: 10 }).getValue())
      .then(page => assert.deepEqual(page.items.map(item => item.id), ['ad-1', 'post-z']));
  });

  it('preserva regressao de ordem e cursor estavel com timestamps concorrentes', async () => {
    const items = [
      FeedItem.restore({ id: 'post-b', authorId: 'a', createdAt: '2026-05-22T12:00:00.000Z' }),
      FeedItem.restore({ id: 'post-a', authorId: 'b', createdAt: '2026-05-22T12:00:00.000Z' }),
      FeedItem.restore({ id: 'post-c', authorId: 'c', createdAt: '2026-05-22T11:59:00.000Z' }),
    ];
    const assembler = new FeedAssembler({ rankingStrategy: new ChronologicalStrategy() });

    const page = await assembler.assemble(items, FeedQuery.create({ userId: 'viewer', limit: 2 }).getValue());
    const decoded = FeedQuery.decodeCursor(page.nextCursor);

    assert.deepEqual({
      ids: page.items.map(item => item.id),
      cursor: decoded,
    }, {
      ids: ['post-b', 'post-a'],
      cursor: { createdAt: '2026-05-22T12:00:00.000Z', id: 'post-a' },
    });
  });
});

describe('FeedCacheInvalidationSubscriber', () => {
  it('invalida NewPost global e Block/Unfollow por usuario', async () => {
    DomainEventPublisher._reset();
    const publisher = DomainEventPublisher.getInstance();
    const rawCache = new MemoryCache();
    const cache = new FeedCache({ cache: rawCache });
    new FeedCacheInvalidationSubscriber({ feedCache: cache }).register(publisher);
    const aliceQuery = FeedQuery.create({ userId: 'alice', limit: 2 }).getValue();
    const bobQuery = FeedQuery.create({ userId: 'bob', limit: 2 }).getValue();

    await cache.set(aliceQuery, { items: ['a'] });
    await cache.set(bobQuery, { items: ['b'] });
    await publisher.publish(FeedRelationshipChanged.block('alice', 'author'));
    assert.deepEqual({ alice: await cache.get(aliceQuery), bob: await cache.get(bobQuery) }, {
      alice: null,
      bob: { items: ['b'] },
    });

    await publisher.publish(new NewPost(FeedItem.restore({ id: 'post-1', authorId: 'author', createdAt: '2026-05-22T12:00:00.000Z' })));
    assert.equal(await cache.get(bobQuery), null);
  });
});

describe('ChangeFeedRelationshipUseCase', () => {
  it('publica Unfollow para invalidar timeline do usuario', async () => {
    let event = null;
    const useCase = new ChangeFeedRelationshipUseCase({
      feedRepository: { unfollow: async () => {} },
      eventPublisher: { publish: async published => { event = published; } },
    });
    const result = await useCase.unfollow({
      userId: 'aaaaaaa1-0000-4000-8000-000000000001',
      authorId: 'aaaaaaa2-0000-4000-8000-000000000002',
    });
    assert.deepEqual({ ok: result.isOk(), eventName: event.eventName }, { ok: true, eventName: 'Unfollow' });
  });
});
