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

  async salvarVariante(mediaId, variant) {
    const row = {
      media_id:     mediaId,
      name:         variant.name,
      version:      variant.version ?? 1,
      storage_path: variant.storagePath,
      mime:         variant.contentType,
      size_bytes:   variant.sizeBytes ?? null,
      width:        variant.width ?? null,
      height:       variant.height ?? null,
      metadata:     variant.metadata ?? {},
    };
    const { error } = await this._db.from('media_variants')
      .upsert([row], { onConflict: 'media_id,name,version' });
    if (error) this._throwDbError(error, 'salvarVariante');
  }

  async markPublished(mediaId, variants, metadata) {
    const rows = variants.map(variant => ({
      media_id: mediaId,
      name: variant.name,
      version: variant.version,
      storage_path: variant.path,
      mime: variant.contentType,
      size_bytes: variant.sizeBytes,
      width: variant.width ?? null,
      height: variant.height ?? null,
      metadata: variant.metadata ?? {},
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

  // ── Cleanup R2 ──────────────────────────────────────────────

  /**
   * Retorna todas as variantes de um media_file com seus storage_paths.
   * @param {string} mediaId
   * @returns {Promise<{media_id: string, storage_path: string, name: string}[]>}
   */
  async listarVariantesPorMediaId(mediaId) {
    const { data, error } = await this._db.from('media_variants')
      .select('media_id, storage_path, name')
      .eq('media_id', mediaId);
    if (error) this._throwDbError(error, 'listarVariantesPorMediaId');
    return data ?? [];
  }

  /**
   * Marca media_file como pendente de limpeza via RPC atômica.
   * Incrementa cleanup_attempts e calcula próxima tentativa com backoff exponencial.
   * @param {string} mediaId
   * @param {string|null} [errorMsg]
   * @returns {Promise<void>}
   */
  async marcarComoPendenteLimpeza(mediaId, errorMsg = null) {
    const { data: current } = await this._db.from('media_files')
      .select('cleanup_attempts').eq('id', mediaId).single();
    const attempt = (current?.cleanup_attempts ?? 0) + 1;
    const baseDelayMs = 5_000;
    const maxDelayMs  = 3_600_000;
    const delayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    const { error } = await this._db.rpc('rpc_increment_media_cleanup_attempt', {
      p_media_id:        mediaId,
      p_error:           errorMsg,
      p_next_attempt_at: nextAttemptAt,
    });
    if (error) this._throwDbError(error, 'marcarComoPendenteLimpeza');
  }

  /**
   * Registra falha de limpeza com mensagem de erro (incremento atômico via RPC).
   * @param {string} mediaId
   * @param {string} errorMsg
   */
  async marcarCleanupFalhou(mediaId, errorMsg) {
    return this.marcarComoPendenteLimpeza(mediaId, String(errorMsg ?? 'Erro desconhecido'));
  }

  /**
   * Busca media_files de contexto 'stories' pendentes de retry R2.
   * Filtra por cleanup_attempts < maxAttempts e next_attempt <= now.
   * @param {number} batchSize
   * @param {number} maxAttempts
   * @returns {Promise<{id: string, path: string, cleanup_attempts: number}[]>}
   */
  async listarPendentesLimpeza(batchSize, maxAttempts = 5) {
    const agora = new Date().toISOString();
    const { data, error } = await this._db.from('media_files')
      .select('id, path, cleanup_attempts')
      .eq('cleanup_status', 'pending')
      .eq('contexto', 'stories')
      .lt('cleanup_attempts', maxAttempts)
      .or(`cleanup_next_attempt_at.is.null,cleanup_next_attempt_at.lte.${agora}`)
      .limit(batchSize);
    if (error) this._throwDbError(error, 'listarPendentesLimpeza');
    return data ?? [];
  }

  /**
   * Hard delete de um media_file após R2 limpo.
   * CASCADE remove media_variants; stories.media_id vira NULL via ON DELETE SET NULL.
   * @param {string} mediaId
   */
  async excluirPorId(mediaId) {
    const { error } = await this._db.from('media_files').delete().eq('id', mediaId);
    if (error) this._throwDbError(error, 'excluirPorId');
  }

  /**
   * Verifica se um media_file existe (para scan de órfãos R2).
   * @param {string} mediaId
   * @returns {Promise<boolean>}
   */
  async existePorId(mediaId) {
    const { count, error } = await this._db.from('media_files')
      .select('id', { count: 'exact', head: true })
      .eq('id', mediaId);
    if (error) this._throwDbError(error, 'existePorId');
    return (count ?? 0) > 0;
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
