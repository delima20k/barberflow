'use strict';

const MediaTelemetry = require('./MediaTelemetry');
const MediaValidator = require('./MediaValidator');
const { ProcessingError, ValidationError } = require('./MediaErrors');

class VideoProcessor {
  #validator;
  #telemetry;
  #probe;
  #thumbnailExtractor;
  #workerQueue;

  constructor({
    validator = new MediaValidator(),
    telemetry = new MediaTelemetry(),
    probe = null,
    thumbnailExtractor = null,
    workerQueue = null,
  } = {}) {
    this.#validator = validator;
    this.#telemetry = telemetry;
    this.#probe = probe;
    this.#thumbnailExtractor = thumbnailExtractor;
    this.#workerQueue = workerQueue;
  }

  async inspect(buffer, { contexto, metadata = {}, signal = null } = {}) {
    this.#throwIfAborted(signal);
    const stage = this.#telemetry.start('video.inspect', { inputBytes: buffer?.length ?? 0, contexto });
    try {
      const info = this.#probe?.inspect
        ? await this.#probe.inspect(buffer, { contexto, metadata, signal })
        : { durationSeconds: metadata.durationSeconds ?? 0, width: metadata.width ?? null, height: metadata.height ?? null };
      this.#validator.validateVideoDuration({ contexto, durationSeconds: info.durationSeconds });
      stage.end({ durationSeconds: info.durationSeconds });
      return info;
    } catch (err) {
      const wrapped = err instanceof ProcessingError || err instanceof ValidationError
        ? err
        : new ProcessingError('Falha ao inspecionar video.', { cause: err });
      stage.fail(wrapped);
      throw wrapped;
    }
  }

  async extractThumbnail(buffer, { contexto, metadata = {}, signal = null } = {}) {
    this.#throwIfAborted(signal);
    const stage = this.#telemetry.start('video.thumbnail', { inputBytes: buffer?.length ?? 0, contexto });
    try {
      const thumbnail = this.#thumbnailExtractor?.extract
        ? await this.#thumbnailExtractor.extract(buffer, { contexto, metadata, signal })
        : {
            data: Buffer.alloc(0),
            contentType: 'image/jpeg',
            bytes: 0,
            pending: true,
            todo: 'TODO: delegar thumbnail/transcode para worker/fila de media quando disponivel.',
          };
      stage.end({ outputBytes: thumbnail.bytes ?? thumbnail.data?.length ?? 0 });
      return thumbnail;
    } catch (err) {
      const wrapped = err instanceof ProcessingError
        ? err
        : new ProcessingError('Falha ao extrair thumbnail.', { cause: err });
      stage.fail(wrapped);
      throw wrapped;
    }
  }

  async enqueueTranscode(job, { signal = null } = {}) {
    this.#throwIfAborted(signal);
    if (!this.#workerQueue?.enqueue) {
      return { queued: false, todo: 'TODO: conectar fila/worker de transcode existente ao VideoProcessor.' };
    }
    return this.#workerQueue.enqueue(job, { signal });
  }

  getMetrics() {
    return this.#telemetry.snapshot();
  }

  #throwIfAborted(signal) {
    if (signal?.aborted) throw new ProcessingError('Processamento de video cancelado.', { status: 499, code: 'PROCESSING_ABORTED' });
  }
}

module.exports = VideoProcessor;
