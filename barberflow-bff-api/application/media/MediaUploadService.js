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

  constructor({ storage, mediaRepository, outboxRepository, confirmationSigner }) {
    if (!storage) throw new TypeError('MediaUploadService: storage e obrigatorio');
    if (!mediaRepository) throw new TypeError('MediaUploadService: mediaRepository e obrigatorio');
    if (!outboxRepository) throw new TypeError('MediaUploadService: outboxRepository e obrigatorio');
    if (!confirmationSigner) throw new TypeError('MediaUploadService: confirmationSigner e obrigatorio');
    this.#storage = storage;
    this.#mediaRepository = mediaRepository;
    this.#outboxRepository = outboxRepository;
    this.#confirmationSigner = confirmationSigner;
  }

  async createSignedUpload(ownerId, request) {
    const policy = MediaUploadService.#policy(request);
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

  async createSignedAccess(ownerId, mediaId, variantName, expiresInSeconds = 300) {
    const variant = await this.#mediaRepository.getOwnedVariant(ownerId, mediaId, variantName);
    if (!variant) throw AppError.notFound('Variante de midia nao encontrada.');
    return this.#storage.createSignedAccess({
      path: variant.path,
      expiresInSeconds: Math.min(Math.max(Number(expiresInSeconds) || 300, 30), 3600),
      privacy: variant.privacy,
    });
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
