'use strict';

const crypto = require('node:crypto');

class NewPost {
  constructor(item) {
    this.eventId = crypto.randomUUID();
    this.eventName = 'NewPost';
    this.aggregateId = item.id;
    this.occurredAt = new Date();
    this.itemId = item.id;
    this.authorId = item.authorId;
    this.fanoutMode = item.fanoutMode;
    Object.freeze(this);
  }
}

module.exports = { NewPost };
