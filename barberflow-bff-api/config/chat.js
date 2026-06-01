'use strict';

class ChatPolicyCatalog {
  constructor({
    pairRateWindowSeconds = Number(process.env.CHAT_PAIR_RATE_WINDOW_SECONDS ?? 10),
    pairRateLimit = Number(process.env.CHAT_PAIR_RATE_LIMIT ?? 30),
    floodWindowSeconds = Number(process.env.CHAT_FLOOD_WINDOW_SECONDS ?? 20),
    duplicateFloodLimit = Number(process.env.CHAT_DUPLICATE_FLOOD_LIMIT ?? 3),
    retentionDays = Number(process.env.CHAT_SOFT_DELETE_RETENTION_DAYS ?? 30),
  } = {}) {
    this.pairRateWindowSeconds = pairRateWindowSeconds;
    this.pairRateLimit = pairRateLimit;
    this.floodWindowSeconds = floodWindowSeconds;
    this.duplicateFloodLimit = duplicateFloodLimit;
    this.retentionDays = retentionDays;
    Object.freeze(this);
  }

  retentionUntil(now = new Date()) {
    return new Date(now.getTime() + this.retentionDays * 24 * 60 * 60 * 1000);
  }
}

module.exports = { ChatPolicyCatalog };
