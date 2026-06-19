'use strict';

const crypto                  = require('node:crypto');
const AppError                = require('../../utils/AppError');
const { QUEUES, JOB_TYPES }   = require('../../config/queues');
const { MediaPolicyCatalog }  = require('../../config/media');

/**
 * MediaUploadService - orquestra reserva, assinatura e confirmacao de uploads.
 */
class MediaUploadService {
  #storage;
  #mediaRepository;
  #outboxRepository;
  #confirmationSigner;
  #videoCompressionService;

  constructor({ storage, mediaRepository, outboxRepository, confirmationSigner, videoCompressionService = null }) {
    if (!storage) throw new TypeError('MediaUploadService: storage e obrigatorio');
    if (!mediaRepository) throw new TypeError('MediaUploadService: mediaRepository e obrigatorio');
    if (!outboxRepository) throw new TypeError('MediaUploadService: outboxRepository e obrigatorio');
    if (!confirmationSigner) throw new TypeError('MediaUploadService: confirmationSigner e obrigatorio');
    this.#storage = storage;
    this.#mediaRepository = mediaRepository;
    this.#outboxRepository = outboxRepository;
    this.#confirmationSigner = confirmationSigner;
    this.#videoCompressionService = videoCompressionService;
  }

  async createSignedUpload(ownerId, request) {
    const policy = MediaUploadService.#policy(request);
    if (request.context === 'stories' && request.contentType === 'video/mp4') {
      throw AppError.badRequest('Videos de story devem usar upload comprimido.');
    }
    const mediaId = request.mediaId ?? crypto.randomUUID();
    const ext = MediaUploadService.#extension(request.contentType);
    const path = `${request.context}/${ownerId}/incoming/${mediaId}.${ext}`;
    const reservation = {
      id: mediaId,
      ownerId,
      context: request.context,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
      privacy: request.privacy ?? policy.privacy,
      sourcePath: path,
    };
    await this.#mediaRepository.reserve(reservation);
    const signed = await this.#storage.createSignedUpload({ ...reservation, path });
    const expiresAt = signed.expiresAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const token = this.#confirmationSigner.sign({ mediaId, ownerId, context: request.context, path, expiresAt });
    return {
      mediaId,
      path,
      uploadUrl: signed.uploadUrl,
      storageToken: signed.token ?? null,
      token,
      expiresAt,
      publicUrl: signed.publicUrl ?? null,
    };
  }

  async confirmUpload(ownerId, request) {
    if (!this.#confirmationSigner.verify(request.confirmationToken ?? request.token, {
      mediaId: request.mediaId,
      ownerId,
      context: request.context,
      path: request.path,
      expiresAt: request.expiresAt,
    })) {
      throw AppError.forbidden('Confirmacao de upload invalida.');
    }
    const object = await this.#storage.assertObjectExists({ path: request.path });
    const media = await this.#mediaRepository.confirmUploaded({
      mediaId: request.mediaId,
      ownerId,
      path: request.path,
      context: request.context,
      sizeBytes: object.sizeBytes,
      contentType: object.contentType,
      metadata: request.metadata ?? {},
    });
    const outboxId = await this.#outboxRepository.save({
      eventName: JOB_TYPES.PROCESS_MEDIA,
      queue: QUEUES.MEDIA,
      payload: {
        mediaId: media.id ?? request.mediaId,
        ownerId,
        context: request.context,
        path: media.path ?? request.path,
        contentType: object.contentType,
      },
    });
    return { id: media.id ?? request.mediaId, outboxId, status: 'queued' };
  }

  async uploadCompressedStory(ownerId, request) {
    if (!this.#videoCompressionService) {
      throw AppError.unavailable('Compressao de video indisponivel.');
    }
    if (!this.#storage || typeof this.#storage.putVariant !== 'function') {
      throw AppError.unavailable('Servico de armazenamento de midia indisponivel.');
    }
    const sourceBytes = request?.bytes;
    if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) {
      throw AppError.badRequest('Arquivo de video ausente.');
    }

    const policyRequest = {
      context: 'stories',
      contentType: String(request?.contentType ?? 'video/mp4').toLowerCase(),
      sizeBytes: Number(request?.sizeBytes ?? sourceBytes.length),
      privacy: request?.privacy,
    };
    const policy = MediaUploadService.#policy(policyRequest);
    if (policyRequest.contentType !== 'video/mp4') {
      throw AppError.badRequest('Apenas video/mp4 pode usar upload comprimido de story.');
    }

    const mediaId = request.mediaId ?? crypto.randomUUID();
    const path = `stories/${ownerId}/incoming/${mediaId}.mp4`;
    await this.#mediaRepository.reserve({
      id: mediaId,
      ownerId,
      context: 'stories',
      contentType: 'video/mp4',
      sizeBytes: sourceBytes.length,
      privacy: request?.privacy ?? policy.privacy,
      sourcePath: path,
    });

    const compression = await this.#videoCompressionService.compress(sourceBytes, { force: true });
    if (compression.error) {
      throw AppError.unprocessable('Falha ao comprimir video de story.');
    }
    await this.#storage.putVariant({
      path,
      bytes: compression.bytes,
      contentType: compression.contentType,
    });

    const media = await this.#mediaRepository.confirmUploaded({
      mediaId,
      ownerId,
      path,
      context: 'stories',
      sizeBytes: compression.outputBytes,
      contentType: compression.contentType,
      metadata: {
        ...(request?.metadata ?? {}),
        videoCompression: {
          compressed: compression.compressed,
          skipped: compression.skipped,
          originalBytes: compression.originalBytes,
          outputBytes: compression.outputBytes,
          error: compression.error,
        },
      },
    });

    const outboxId = await this.#outboxRepository.save({
      eventName: JOB_TYPES.PROCESS_MEDIA,
      queue: QUEUES.MEDIA,
      payload: {
        mediaId: media.id ?? mediaId,
        ownerId,
        context: 'stories',
        path: media.path ?? path,
        contentType: compression.contentType,
      },
    });

    return {
      id: media.id ?? mediaId,
      mediaId: media.id ?? mediaId,
      path: media.path ?? path,
      publicUrl: typeof this.#storage.publicUrl === 'function' ? this.#storage.publicUrl(media.path ?? path) : null,
      outboxId,
      status: 'queued',
      compression: {
        compressed: compression.compressed,
        skipped: compression.skipped,
        originalBytes: compression.originalBytes,
        outputBytes: compression.outputBytes,
        error: compression.error,
      },
    };
  }

  async createSignedAccess(ownerId, mediaId, variantName, expiresInSeconds = 300) {
    const variant = await this.#mediaRepository.getOwnedVariant(ownerId, mediaId, variantName);
    if (!variant) throw AppError.notFound('Variante de midia nao encontrada.');
    return this.#storage.createSignedAccess({
      path: variant.path,
      expiresInSeconds: Math.min(Math.max(Number(expiresInSeconds) || 300, 30), 3600),
      privacy: variant.privacy,
    });
  }

  /**
   * Recebe thumbnail em base64, faz upload para R2 e registra variante no banco.
   * Chamado pelo frontend após captura via Canvas API.
   * @param {string} ownerId
   * @param {string} mediaId
   * @param {string} thumbnailBase64 — JPEG em base64 sem prefixo data:
   * @returns {Promise<{path: string}>}
   */
  async salvarThumb(ownerId, mediaId, thumbnailBase64) {
    const MAX_B64_BYTES = 500_000;
    if (typeof thumbnailBase64 !== 'string' || thumbnailBase64.length === 0 || thumbnailBase64.length > MAX_B64_BYTES) {
      throw AppError.badRequest('Thumbnail invalida ou muito grande.');
    }
    const buffer = Buffer.from(thumbnailBase64, 'base64');
    if (buffer.length < 100) throw AppError.badRequest('Thumbnail muito pequena.');
    const media = await this.#mediaRepository.getForProcessing(mediaId, ownerId);
    if (!media) throw AppError.forbidden('Midia nao encontrada ou sem permissao.');
    const path = `stories/${ownerId}/thumbnails/${mediaId}.jpg`;
    await this.#storage.putVariant({ path, bytes: buffer, contentType: 'image/jpeg' });
    await this.#mediaRepository.salvarVariante(mediaId, {
      name: 'thumb',
      version: 1,
      storagePath: path,
      contentType: 'image/jpeg',
      sizeBytes: buffer.length,
    });
    return { path };
  }

  static #policy(request) {
    const context = String(request?.context ?? '').toLowerCase();
    const policy = MediaPolicyCatalog.context(context);
    if (!policy) throw AppError.badRequest('Contexto de midia invalido.');
    const contentType = String(request?.contentType ?? '').toLowerCase();
    if (!policy.mimes.includes(contentType)) throw AppError.badRequest('Tipo de midia nao permitido.');
    const sizeBytes = Number(request?.sizeBytes ?? 0);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > policy.maxBytes) {
      throw AppError.badRequest('Tamanho da midia excede o limite configurado.');
    }
    request.context = context;
    request.contentType = contentType;
    request.sizeBytes = sizeBytes;
    return policy;
  }

  static #extension(contentType) {
    return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' })[contentType] ?? 'bin';
  }
}

module.exports = { MediaUploadService };
