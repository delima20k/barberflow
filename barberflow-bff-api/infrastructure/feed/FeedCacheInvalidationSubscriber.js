'use strict';

class FeedCacheInvalidationSubscriber {
  #feedCache;

  constructor({ feedCache }) {
    if (!feedCache) throw new TypeError('FeedCacheInvalidationSubscriber: feedCache obrigatorio.');
    this.#feedCache = feedCache;
  }

  register(publisher) {
    publisher.subscribe('NewPost', () => this.#feedCache.invalidateAll());
    publisher.subscribe('Block', event => this.#feedCache.invalidateUser(event.userId));
    publisher.subscribe('Unfollow', event => this.#feedCache.invalidateUser(event.userId));
  }
}

module.exports = { FeedCacheInvalidationSubscriber };
