'use strict';

const { Result } = require('../../shared/Result');

class FeedQuery {
  static MAX_LIMIT = 50;
  static STRATEGIES = new Set(['chronological', 'engagement', 'personalized']);
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static create({ userId, cursor = null, limit = 20, strategy = 'personalized' } = {}) {
    if (!userId || typeof userId !== 'string') return Result.fail('FeedQuery.userId obrigatorio.');
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > FeedQuery.MAX_LIMIT) {
      return Result.fail(`FeedQuery.limit deve ficar entre 1 e ${FeedQuery.MAX_LIMIT}.`);
    }
    const decodedCursor = cursor ? FeedQuery.decodeCursor(cursor) : null;
    if (cursor && !decodedCursor) return Result.fail('FeedQuery.cursor invalido.');
    if (!FeedQuery.STRATEGIES.has(strategy)) return Result.fail('FeedQuery.strategy invalida.');
    return Result.ok(new FeedQuery({ userId, cursor: decodedCursor, limit: normalizedLimit, strategy }));
  }

  static encodeCursor({ createdAt, id }) {
    return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
  }

  static decodeCursor(cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
      if (!decoded?.createdAt || !decoded?.id || Number.isNaN(new Date(decoded.createdAt).getTime())) return null;
      return { createdAt: new Date(decoded.createdAt).toISOString(), id: String(decoded.id) };
    } catch {
      return null;
    }
  }

  get userId() { return this.#props.userId; }
  get cursor() { return this.#props.cursor; }
  get limit() { return this.#props.limit; }
  get strategy() { return this.#props.strategy; }
}

module.exports = { FeedQuery };
