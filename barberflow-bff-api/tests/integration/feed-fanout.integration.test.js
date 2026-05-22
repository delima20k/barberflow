'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PublishFeedItemUseCase } = require('../../application/feed/PublishFeedItemUseCase');
const { FeedFanoutPolicy } = require('../../config/feed');
const { JOB_TYPES, QUEUES } = require('../../config/queues');

class FeedFanoutHarness {
  constructor(followersCount) {
    this.savedItem = null;
    this.outboxEvents = [];
    this.inboxRows = [];
    this.feedRepository = {
      hasRecentContentHash: async () => false,
      countRecentPostsByAuthor: async () => 0,
      countFollowers: async () => followersCount,
      saveItem: async item => { this.savedItem = item; return item; },
    };
    this.outboxRepository = {
      save: async event => { this.outboxEvents.push(event); return 'outbox-feed'; },
    };
  }
}

describe('[Integration] Feed fanout hibrido', () => {
  it('autor com 10k followers publica como pull sem materializar 10k inboxes', async () => {
    const harness = new FeedFanoutHarness(10_000);
    const useCase = new PublishFeedItemUseCase({
      feedRepository: harness.feedRepository,
      outboxRepository: harness.outboxRepository,
      eventPublisher: { publish: async () => {} },
      policy: new FeedFanoutPolicy({ writeFanoutFollowerLimit: 5_000 }),
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });
    const started = performance.now();

    const result = await useCase.execute({
      authorId: 'heavy-author',
      sourceType: 'story',
      sourceId: 'aaaaaaa1-0000-4000-8000-000000000001',
      contentHash: 'content-hash-1',
    });
    const totalMs = performance.now() - started;

    assert.deepEqual({
      ok: result.isOk(),
      mode: result.getValue().fanoutMode,
      jobType: harness.outboxEvents[0].eventName,
      queue: harness.outboxEvents[0].queue,
      under100Ms: totalMs < 100,
    }, {
      ok: true,
      mode: 'pull',
      jobType: JOB_TYPES.GENERATE_FEED,
      queue: QUEUES.FEED,
      under100Ms: true,
    });
  });
});
