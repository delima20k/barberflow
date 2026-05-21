'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * MediaProcessingHandler — Processa imagens de forma assíncrona.
 *
 * Migração: substitui o processamento síncrono de sharp em BarbeariaMediaService.
 * O controller agora persiste o arquivo bruto e enfileira este job,
 * retornando 202 Accepted ao invés de bloquear no resize/compress.
 *
 * Payload esperado:
 *   fileId      — ID do arquivo no storage (ex: path no Supabase)
 *   ownerId     — UUID do usuário dono da barbearia
 *   tipo        — 'logo' | 'cover'
 *   contentType — MIME type original (ex: 'image/jpeg')
 *
 * Side effects:
 *   1. Faz download do arquivo bruto
 *   2. Processa com sharp (resize + WebP)
 *   3. Faz upload do arquivo processado
 *   4. Atualiza registro da barbearia
 */
class MediaProcessingHandler extends JobHandler {
  #imageProcessor;
  #mediaRepository;

  /**
   * @param {{
   *   imageProcessor:  { process(fileId: string, tipo: string): Promise<{ data: Buffer, format: string }> },
   *   mediaRepository: { save(fileId: string, result: object, ownerId: string): Promise<void> }
   * }} deps
   */
  constructor({ imageProcessor, mediaRepository }) {
    super();
    if (!imageProcessor)  throw new TypeError('MediaProcessingHandler: imageProcessor é obrigatório');
    if (!mediaRepository) throw new TypeError('MediaProcessingHandler: mediaRepository é obrigatório');
    this.#imageProcessor  = imageProcessor;
    this.#mediaRepository = mediaRepository;
  }

  get jobType() { return JOB_TYPES.PROCESS_MEDIA; }

  async handle(job) {
    const { fileId, ownerId, tipo, contentType } = job.payload;

    if (!fileId)  throw new Error('MediaProcessingHandler: fileId ausente no payload');
    if (!ownerId) throw new Error('MediaProcessingHandler: ownerId ausente no payload');
    if (!tipo)    throw new Error('MediaProcessingHandler: tipo ausente no payload');

    const processed = await this.#imageProcessor.process(fileId, tipo, contentType);
    await this.#mediaRepository.save(fileId, processed, ownerId);
  }
}

module.exports = { MediaProcessingHandler };
