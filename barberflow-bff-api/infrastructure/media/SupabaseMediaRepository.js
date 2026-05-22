'use strict';

const BaseRepository = require('../../repositories/BaseRepository');

/**
 * SupabaseMediaRepository - metadados de media e variantes no Postgres.
 */
class SupabaseMediaRepository extends BaseRepository {
  constructor(db) {
    super('SupabaseMediaRepository', db);
  }

  async reserve(media) {
    const { data, error } = await this._db.from('media_files').insert({
      id: media.id,
      owner_id: media.ownerId,
      contexto: media.context,
      path: media.sourcePath,
      public_url: '',
      source_path: media.sourcePath,
      declared_mime: media.contentType,
      declared_size_bytes: media.sizeBytes,
      privacy: media.privacy,
      status: 'reserved',
    }).select('id, source_path').single();
    if (error) this._throwDbError(error, 'reserve');
    return data;
  }

  async confirmUploaded(media) {
    const { data, error } = await this._db.from('media_files').update({
      source_path: media.path,
      source_mime: media.contentType,
      source_size_bytes: media.sizeBytes,
      metadata: media.metadata,
      status: 'uploaded',
    }).eq('id', media.mediaId).eq('owner_id', media.ownerId)
      .select('id, source_path').single();
    if (error) this._throwDbError(error, 'confirmUploaded');
    return { id: data.id, path: data.source_path };
  }

  async getForProcessing(mediaId, ownerId) {
    const { data, error } = await this._db.from('media_files')
      .select('id, owner_id, contexto, source_path, source_mime, source_size_bytes, metadata')
      .eq('id', mediaId).eq('owner_id', ownerId).single();
    if (error) this._throwDbError(error, 'getForProcessing');
    return data;
  }

  async findByPerceptualHash(hash, ownerId) {
    const { data, error } = await this._db.from('media_files')
      .select('id').eq('owner_id', ownerId).eq('perceptual_hash', hash).eq('status', 'published').limit(1);
    if (error) this._throwDbError(error, 'findByPerceptualHash');
    return data?.[0] ?? null;
  }

  async markPublished(mediaId, variants, metadata) {
    const rows = variants.map(variant => ({
      media_id: mediaId,
      name: variant.name,
      version: variant.version,
      storage_path: variant.path,
      mime: variant.contentType,
      size_bytes: variant.sizeBytes,
    }));
    const { error: variantsError } = await this._db.from('media_variants').upsert(rows, { onConflict: 'media_id,name,version' });
    if (variantsError) this._throwDbError(variantsError, 'markPublished variants');
    const { error } = await this._db.from('media_files').update({
      perceptual_hash: metadata.perceptualHash ?? null,
      duplicate_of: metadata.duplicateOf ?? null,
      metadata,
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', mediaId);
    if (error) this._throwDbError(error, 'markPublished media');
  }

  async getOwnedVariant(ownerId, mediaId, name) {
    const { data, error } = await this._db.from('media_files')
      .select('id, privacy, media_variants!inner(name, storage_path, version)')
      .eq('id', mediaId).eq('owner_id', ownerId).eq('media_variants.name', name).limit(1).single();
    if (error?.code === 'PGRST116') return null;
    if (error) this._throwDbError(error, 'getOwnedVariant');
    const variant = data.media_variants?.[0];
    return variant ? { path: variant.storage_path, privacy: data.privacy, version: variant.version } : null;
  }
}

module.exports = { SupabaseMediaRepository };
