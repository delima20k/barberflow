'use strict';

class DigestAggregationStrategy {
  #threshold;

  constructor({ threshold = 3 } = {}) {
    this.#threshold = Math.max(2, Number(threshold) || 3);
  }

  shouldAggregate({ notification, preferences, pendingCount = 1 }) {
    if (notification.isHighPriority()) return false;
    if (!preferences.usesDigest(notification.category)) return false;
    return pendingCount < this.#threshold;
  }

  aggregate(notifications) {
    const list = notifications ?? [];
    if (!list.length) return null;
    const first = list[0];
    return {
      userId: first.userId,
      templateId: first.templateId,
      category: first.category,
      count: list.length,
      digestKey: first.digestKey ?? `${first.category}:${first.templateId}`,
    };
  }
}

module.exports = { DigestAggregationStrategy };
