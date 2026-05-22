'use strict';

const crypto = require('node:crypto');
const { Result } = require('../../shared/Result');

class FeedItem {
  static SOURCE_TYPES = new Set(['story', 'portfolio_image', 'post']);
  static UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static create({ authorId, sourceType, sourceId, contentHash, createdAt = new Date(), fanoutMode = 'write' } = {}) {
    if (!authorId || !sourceType || !sourceId) {
      return Result.fail('FeedItem requer authorId, sourceType e sourceId.');
    }
    if (!FeedItem.SOURCE_TYPES.has(sourceType)) return Result.fail('FeedItem.sourceType invalido.');
    if (!FeedItem.UUID.test(sourceId)) return Result.fail('FeedItem.sourceId deve ser UUID.');
    if (typeof contentHash !== 'string' || contentHash.length < 8 || contentHash.length > 256) {
      return Result.fail('FeedItem.contentHash invalido.');
    }
    return Result.ok(new FeedItem(FeedItem.#normalize({
      id: crypto.randomUUID(),
      authorId,
      sourceType,
      sourceId,
      contentHash,
      createdAt,
      fanoutMode,
    })));
  }

  static restore(props) {
    if (!props?.id || !props?.authorId || !props?.createdAt) {
      throw new TypeError('FeedItem.restore requer id, authorId e createdAt.');
    }
    return new FeedItem(FeedItem.#normalize(props));
  }

  static #normalize(props) {
    const createdAt = props.createdAt instanceof Date ? props.createdAt : new Date(props.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new TypeError('FeedItem.createdAt invalido.');
    return {
      id: props.id,
      authorId: props.authorId,
      sourceType: props.sourceType ?? 'feed',
      sourceId: props.sourceId ?? props.id,
      contentHash: props.contentHash ?? null,
      createdAt,
      likesCount: Math.max(0, Number(props.likesCount ?? 0)),
      viewsCount: Math.max(0, Number(props.viewsCount ?? 0)),
      affinityScore: Math.max(0, Number(props.affinityScore ?? 0)),
      sponsored: Boolean(props.sponsored),
      suggestion: Boolean(props.suggestion),
      fanoutMode: props.fanoutMode === 'pull' ? 'pull' : 'write',
      metadata: props.metadata ?? {},
    };
  }

  get id() { return this.#props.id; }
  get authorId() { return this.#props.authorId; }
  get sourceType() { return this.#props.sourceType; }
  get sourceId() { return this.#props.sourceId; }
  get contentHash() { return this.#props.contentHash; }
  get createdAt() { return this.#props.createdAt; }
  get likesCount() { return this.#props.likesCount; }
  get viewsCount() { return this.#props.viewsCount; }
  get affinityScore() { return this.#props.affinityScore; }
  get sponsored() { return this.#props.sponsored; }
  get suggestion() { return this.#props.suggestion; }
  get fanoutMode() { return this.#props.fanoutMode; }

  toJSON() {
    return {
      id: this.id,
      authorId: this.authorId,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      contentHash: this.contentHash,
      createdAt: this.createdAt.toISOString(),
      likesCount: this.likesCount,
      viewsCount: this.viewsCount,
      affinityScore: this.affinityScore,
      sponsored: this.sponsored,
      suggestion: this.suggestion,
      fanoutMode: this.fanoutMode,
      metadata: this.#props.metadata,
    };
  }
}

module.exports = { FeedItem };
