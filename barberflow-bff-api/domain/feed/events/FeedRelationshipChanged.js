'use strict';

const crypto = require('node:crypto');

class FeedRelationshipChanged {
  constructor(eventName, userId, authorId) {
    this.eventId = crypto.randomUUID();
    this.eventName = eventName;
    this.aggregateId = `${userId}:${authorId}`;
    this.occurredAt = new Date();
    this.userId = userId;
    this.authorId = authorId;
    Object.freeze(this);
  }

  static block(userId, authorId) {
    return new FeedRelationshipChanged('Block', userId, authorId);
  }

  static unfollow(userId, authorId) {
    return new FeedRelationshipChanged('Unfollow', userId, authorId);
  }
}

module.exports = { FeedRelationshipChanged };
