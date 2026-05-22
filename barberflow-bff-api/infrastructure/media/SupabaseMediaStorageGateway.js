'use strict';

/**
 * SupabaseMediaStorageGateway - storage adapter para fontes e variantes.
 */
class SupabaseMediaStorageGateway {
  #db;
  #sourceBucket;
  #cdnBucket;

  constructor({ db, sourceBucket = process.env.MEDIA_SOURCE_BUCKET ?? 'media-private', cdnBucket = process.env.MEDIA_CDN_BUCKET ?? 'media-cdn' }) {
    this.#db = db;
    this.#sourceBucket = sourceBucket;
    this.#cdnBucket = cdnBucket;
  }

  async createSignedUpload({ path }) {
    this.#assertStorage();
    const { data, error } = await this.#db.storage.from(this.#sourceBucket).createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    return {
      uploadUrl: data.signedUrl,
      token: data.token,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
  }

  async assertObjectExists({ path }) {
    const bytes = await this.downloadSource(path);
    return { sizeBytes: bytes.length, contentType: SupabaseMediaStorageGateway.#contentType(path) };
  }

  async downloadSource(path) {
    this.#assertStorage();
    const { data, error } = await this.#db.storage.from(this.#sourceBucket).download(path);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async putVariant(variant) {
    this.#assertStorage();
    const { error } = await this.#db.storage.from(this.#cdnBucket).upload(variant.path, variant.bytes, {
      contentType: variant.contentType,
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw error;
  }

  async createSignedAccess({ path, expiresInSeconds, privacy }) {
    this.#assertStorage();
    if (privacy === 'public') {
      return this.#db.storage.from(this.#cdnBucket).getPublicUrl(path).data;
    }
    const { data, error } = await this.#db.storage.from(this.#cdnBucket).createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data;
  }

  get sourceBucket() {
    return this.#sourceBucket;
  }

  static #contentType(path) {
    const ext = String(path).split('.').pop()?.toLowerCase();
    return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' })[ext] ?? 'application/octet-stream';
  }

  #assertStorage() {
    if (!this.#db?.storage) throw new TypeError('SupabaseMediaStorageGateway: db.storage e obrigatorio');
  }
}

module.exports = { SupabaseMediaStorageGateway };
