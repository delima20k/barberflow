'use strict';

class NotificationRouter {
  #presenceLink;
  #digestStrategy;
  #clock;

  constructor({ presenceLink, digestStrategy, clock = { now: () => new Date() } }) {
    this.#presenceLink = presenceLink ?? { isOnline: () => false };
    this.#digestStrategy = digestStrategy;
    this.#clock = clock;
  }

  route({ notification, preferences, pendingDigestCount = 1 }) {
    const immediateChannels = [];
    const delayedChannels = [];
    const digestChannels = [];
    const suppressedChannels = [];
    const online = this.#presenceLink.isOnline(notification.userId);
    const quiet = preferences.isQuietHour(this.#clock.now());
    const digest = this.#digestStrategy?.shouldAggregate({ notification, preferences, pendingCount: pendingDigestCount }) === true;

    for (const channel of notification.channels) {
      if (!preferences.allows(notification.category, channel)) {
        suppressedChannels.push(channel);
        continue;
      }
      if (digest) {
        digestChannels.push(channel);
        continue;
      }
      if (!notification.isHighPriority() && quiet && channel !== 'in_app') {
        delayedChannels.push(channel);
        continue;
      }
      if (channel === 'in_app' && !online) continue;
      if (channel === 'push' && online) continue;
      immediateChannels.push(channel);
    }

    return { immediateChannels, delayedChannels, digestChannels, suppressedChannels };
  }
}

module.exports = { NotificationRouter };
