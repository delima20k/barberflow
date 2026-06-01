'use strict';

class FeedFanoutPolicy {
  #writeFanoutFollowerLimit;
  #postRateLimit;
  #postRateWindowSeconds;
  #viralThrottlePerPage;

  constructor({
    writeFanoutFollowerLimit = Number(process.env.FEED_WRITE_FANOUT_LIMIT ?? 5_000),
    postRateLimit = Number(process.env.FEED_POST_RATE_LIMIT ?? 12),
    postRateWindowSeconds = Number(process.env.FEED_POST_RATE_WINDOW_SECONDS ?? 3600),
    viralThrottlePerPage = Number(process.env.FEED_VIRAL_THROTTLE_PER_PAGE ?? 2),
  } = {}) {
    this.#writeFanoutFollowerLimit = Math.max(1, writeFanoutFollowerLimit);
    this.#postRateLimit = Math.max(1, postRateLimit);
    this.#postRateWindowSeconds = Math.max(60, postRateWindowSeconds);
    this.#viralThrottlePerPage = Math.max(1, viralThrottlePerPage);
  }

  get writeFanoutFollowerLimit() { return this.#writeFanoutFollowerLimit; }
  get postRateLimit() { return this.#postRateLimit; }
  get postRateWindowSeconds() { return this.#postRateWindowSeconds; }
  get viralThrottlePerPage() { return this.#viralThrottlePerPage; }

  modeForFollowers(followersCount) {
    return followersCount > this.#writeFanoutFollowerLimit ? 'pull' : 'write';
  }
}

module.exports = { FeedFanoutPolicy };
