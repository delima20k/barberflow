'use strict';

/**
 * MediaPipelineProcessor - monta input tipado do pipeline a partir do job.
 */
class MediaPipelineProcessor {
  #pipeline;
  #storage;
  #mediaRepository;

  constructor({ pipeline, storage, mediaRepository }) {
    this.#pipeline = pipeline;
    this.#storage = storage;
    this.#mediaRepository = mediaRepository;
  }

  async process(mediaId, ownerId) {
    const row = await this.#mediaRepository.getForProcessing(mediaId, ownerId);
    const bytes = await this.#storage.downloadSource(row.source_path);
    return this.#pipeline.process({
      mediaId: row.id,
      ownerId: row.owner_id,
      context: row.contexto,
      source: {
        bucket: this.#storage.sourceBucket,
        path: row.source_path,
        bytes,
        contentType: row.source_mime,
        sizeBytes: row.source_size_bytes ?? bytes.length,
      },
      variants: [],
      metadata: row.metadata ?? {},
    });
  }
}

module.exports = { MediaPipelineProcessor };
