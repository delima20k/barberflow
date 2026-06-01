'use strict';

const crypto = require('crypto');
const MediaTelemetry = require('./MediaTelemetry');
const MediaValidator = require('./MediaValidator');
const { UploadError, ValidationError } = require('./MediaErrors');

const PRESIGNED_EXPIRES_SECS = 300;

class MediaUploadService {
  #storage;
  #supabase;
  #validator;
  #signingSecret;
  #telemetry;
  #eventBus;
  #cryptoProvider;
  #retries;

  constructor({
    storage,
    supabase = null,
    validator = new MediaValidator(),
    signingSecret = process.env.MEDIA_SIGNING_SECRET ?? '',
    telemetry = new MediaTelemetry(),
    eventBus = null,
    cryptoProvider = crypto,
    retries = 1,
  } = {}) {
    if (!storage) throw new TypeError('[MediaUploadService] storage e obrigatorio.');
    if (!signingSecret) throw new Error('[MediaUploadService] MEDIA_SIGNING_SECRET e obrigatorio.');
    this.#storage = storage;
    this.#supabase = supabase;
    this.#validator = validator;
    this.#signingSecret = signingSecret;
    this.#telemetry = telemetry;
    this.#eventBus = eventBus;
    this.#cryptoProvider = cryptoProvider;
    this.#retries = retries;
  }

  async gerarUrlPresigned({ contexto, ownerId, contentType, signal = null }) {
    this.#throwIfAborted(signal);
    const stage = this.#telemetry.start('upload.presigned', { contexto, contentType });
    try {
      this.#validator.validateUploadRequest({ contexto, ownerId, contentType });
      const ext = this.#validator.extensionFor(contentType);
      const path = `${contexto}/${ownerId}/${this.#cryptoProvider.randomUUID()}.${ext}`;
      const expiresAt = Math.floor(Date.now() / 1000) + PRESIGNED_EXPIRES_SECS;
      const token = this.assinarToken(path, ownerId, expiresAt);
      const uploadUrl = await this.#storage.presignedPut(contexto, path, contentType, PRESIGNED_EXPIRES_SECS);
      const publicUrl = this.#storage.publicUrl(contexto, path);
      stage.end();
      return { uploadUrl, path, publicUrl, token, expiresAt };
    } catch (err) {
      const wrapped = this.#wrapUploadError(err, 'Falha ao gerar URL de upload.');
      stage.fail(wrapped);
      this.#emit('validation-failed', { contexto, contentType, error: wrapped });
      throw wrapped;
    }
  }

  async confirmarUpload({ path, ownerId, contexto, token, expiresAt, metadata = {}, signal = null }) {
    this.#throwIfAborted(signal);
    const stage = this.#telemetry.start('upload.confirm', { contexto, path });
    try {
      this.#validator.validateUploadRequest({ contexto, ownerId, contentType: this.#contentTypeFromPath(path) });
      this.#validateConfirmationToken({ path, ownerId, token, expiresAt });

      const info = await this.#storage.head(contexto, path);
      if (!info) {
        throw new UploadError('Arquivo nao encontrado no storage. Realize o upload antes de confirmar.', { status: 404 });
      }

      const effectiveContentType = info.contentType === 'application/octet-stream'
        ? this.#contentTypeFromPath(path)
        : info.contentType;
      this.#validator.validateUploadRequest({
        contexto,
        ownerId,
        contentType: effectiveContentType,
        sizeBytes: info.tamanhoBytes,
      });

      const publicUrl = this.#storage.publicUrl(contexto, path);
      const metadataFinal = {
        ...metadata,
        storage_backend: this.#storage.backendPara(contexto),
      };

      const { data, error } = await this.#supabase
        .from('media_files')
        .insert({
          owner_id: ownerId,
          contexto,
          path,
          public_url: publicUrl,
          content_type: effectiveContentType,
          tamanho_bytes: info.tamanhoBytes,
          metadata: metadataFinal,
        })
        .select('id')
        .single();

      if (error) throw new UploadError(error.message, { status: 500 });
      const result = { id: data.id, path, publicUrl, tamanhoBytes: info.tamanhoBytes };
      stage.end({ outputBytes: info.tamanhoBytes });
      this.#emit('upload-completed', { contexto, path, mediaId: data.id, bytes: info.tamanhoBytes });
      return result;
    } catch (err) {
      if (err instanceof ValidationError && err.status === 413) {
        await this.#storage.delete(contexto, path).catch(() => {});
      }
      const wrapped = this.#wrapUploadError(err, 'Falha ao confirmar upload.');
      stage.fail(wrapped);
      if (wrapped instanceof ValidationError) this.#emit('validation-failed', { contexto, path, error: wrapped });
      throw wrapped;
    }
  }

  async uploadDirect({ uploadUrl, body, contentType, fetchImpl = globalThis.fetch, signal = null, onProgress = null } = {}) {
    if (!uploadUrl) throw new UploadError('uploadUrl e obrigatorio.', { status: 400 });
    if (!fetchImpl) throw new UploadError('fetchImpl e obrigatorio para upload direto.', { status: 500 });
    this.#throwIfAborted(signal);
    const bytes = body?.length ?? body?.byteLength ?? body?.size ?? 0;
    const stage = this.#telemetry.start('upload.direct', { inputBytes: bytes, contentType });

    try {
      let lastError = null;
      for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
        this.#throwIfAborted(signal);
        try {
          this.#emitProgress({ loaded: 0, total: bytes, attempt, onProgress });
          const response = await fetchImpl(uploadUrl, {
            method: 'PUT',
            headers: contentType ? { 'Content-Type': contentType } : undefined,
            body,
            signal,
          });
          if (!response?.ok) throw new UploadError(`Upload direto falhou com status ${response?.status ?? 'desconhecido'}.`, { status: response?.status ?? 502 });
          this.#emitProgress({ loaded: bytes, total: bytes, attempt, onProgress });
          stage.end({ outputBytes: bytes });
          return { ok: true, attempts: attempt + 1, bytes };
        } catch (err) {
          lastError = err;
          if (signal?.aborted || attempt >= this.#retries) break;
        }
      }
      throw this.#wrapUploadError(lastError, 'Falha ao enviar arquivo.');
    } catch (err) {
      const wrapped = this.#wrapUploadError(err, 'Falha ao enviar arquivo.');
      stage.fail(wrapped);
      throw wrapped;
    }
  }

  assinarToken(path, ownerId, expiresAt) {
    return this.#cryptoProvider
      .createHmac('sha256', this.#signingSecret)
      .update(`${path}:${ownerId}:${expiresAt}`)
      .digest('hex');
  }

  getMetrics() {
    return this.#telemetry.snapshot();
  }

  #validateConfirmationToken({ path, ownerId, token, expiresAt }) {
    if (!path || typeof path !== 'string') throw new ValidationError('path invalido.', { status: 400 });
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw new ValidationError('expiresAt invalido.', { status: 400 });
    }

    const esperado = this.assinarToken(path, ownerId, expiresAt);
    const bufTok = Buffer.from(typeof token === 'string' ? token : '', 'hex');
    const bufEsp = Buffer.from(esperado, 'hex');
    const tokenValido = bufTok.length === bufEsp.length && crypto.timingSafeEqual(bufTok, bufEsp);
    if (!tokenValido) throw new UploadError('Token invalido.', { status: 401, code: 'UPLOAD_TOKEN_INVALID' });
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      throw new UploadError('Token expirado. Solicite uma nova URL de upload.', { status: 401, code: 'UPLOAD_TOKEN_EXPIRED' });
    }
  }

  #contentTypeFromPath(path) {
    const ext = String(path ?? '').split('.').pop()?.toLowerCase();
    const match = Object.entries(MediaValidator.MIME_PARA_EXT).find(([, value]) => value === ext);
    return match?.[0] ?? 'application/octet-stream';
  }

  #emitProgress({ loaded, total, attempt, onProgress }) {
    const payload = { loaded, total, attempt };
    onProgress?.(payload);
    this.#emit('upload-progress', payload);
  }

  #emit(eventName, payload) {
    this.#eventBus?.emit?.(eventName, payload);
  }

  #throwIfAborted(signal) {
    if (signal?.aborted) throw new UploadError('Upload cancelado.', { status: 499, code: 'UPLOAD_ABORTED' });
  }

  #wrapUploadError(err, message) {
    if (err instanceof UploadError || err instanceof ValidationError) return err;
    if (err?.name === 'AbortError') return new UploadError('Upload cancelado.', { status: 499, code: 'UPLOAD_ABORTED', cause: err });
    return new UploadError(message, { status: err?.status ?? 502, cause: err });
  }
}

module.exports = MediaUploadService;
