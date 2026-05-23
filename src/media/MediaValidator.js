'use strict';

const BaseService = require('../infra/BaseService');
const { ValidationError } = require('./MediaErrors');

const MIME_PARA_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'oga',
  'audio/webm': 'weba',
  'audio/mp4': 'm4a',
});

const CONTEXTOS = Object.freeze({
  stories: {
    maxBytes: 50 * 1024 * 1024,
    maxDurationSeconds: 60,
    mimes: new Set([
      'video/mp4', 'video/webm',
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4',
    ]),
  },
  avatars: {
    maxBytes: 2 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
  services: {
    maxBytes: 5 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
  portfolio: {
    maxBytes: 10 * 1024 * 1024,
    maxDurationSeconds: 600,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
});

class MediaValidator extends BaseService {
  #contexts;

  constructor({ contexts = CONTEXTOS } = {}) {
    super('MediaValidator');
    this.#contexts = contexts;
  }

  validateUploadRequest({ contexto, ownerId, contentType, sizeBytes = null, buffer = null } = {}) {
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(this.#contexts));
    const cfg = this.#contexts[contexto];

    if (!cfg.mimes.has(contentType)) {
      throw new ValidationError(`Tipo de arquivo nao permitido para "${contexto}": ${contentType}`, {
        status: 415,
        details: { contexto, contentType },
      });
    }

    const bytes = sizeBytes ?? buffer?.length ?? null;
    if (bytes != null) this.validateSize({ contexto, sizeBytes: bytes });
    return cfg;
  }

  validateBuffer(buffer, { required = true } = {}) {
    if (!Buffer.isBuffer(buffer) || (required && buffer.length === 0)) {
      throw new ValidationError('buffer deve ser um Buffer nao vazio.', { status: 400 });
    }
  }

  validateSize({ contexto, sizeBytes }) {
    this._enum('contexto', contexto, Object.keys(this.#contexts));
    const cfg = this.#contexts[contexto];
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      throw new ValidationError('sizeBytes invalido.', { status: 400 });
    }
    if (sizeBytes > cfg.maxBytes) {
      throw new ValidationError(`Arquivo excede o limite de ${cfg.maxBytes / 1024 / 1024} MB para "${contexto}".`, {
        status: 413,
        details: { contexto, sizeBytes, maxBytes: cfg.maxBytes },
      });
    }
  }

  validateVideoDuration({ contexto, durationSeconds }) {
    this._enum('contexto', contexto, Object.keys(this.#contexts));
    const max = this.#contexts[contexto].maxDurationSeconds;
    if (!max) return;
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      throw new ValidationError('Duracao de video invalida.', { status: 400 });
    }
    if (durationSeconds > max) {
      throw new ValidationError(`Video excede o limite de ${max}s para "${contexto}".`, {
        status: 413,
        details: { contexto, durationSeconds, maxDurationSeconds: max },
      });
    }
  }

  detectKind({ contentType }) {
    if (contentType?.startsWith('image/')) return 'image';
    if (contentType?.startsWith('video/')) return 'video';
    if (contentType?.startsWith('audio/')) return 'audio';
    return 'binary';
  }

  detectImageStrategy({ buffer = null, contentType = '', metadata = {} } = {}) {
    if (metadata.strategyOverride) return metadata.strategyOverride;
    if (contentType === 'image/gif' || this.isAnimatedImage(buffer)) return 'animated';
    if (metadata.source === 'screenshot' || metadata.hasText === true) return 'screenshot';
    return 'photo';
  }

  detectMagicMime(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return 'application/octet-stream';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp';
    }
    return 'application/octet-stream';
  }

  isAnimatedImage(buffer) {
    if (!Buffer.isBuffer(buffer)) return false;
    const text = buffer.toString('latin1');
    return text.startsWith('GIF8') && (text.match(/\x21\xF9\x04/g) ?? []).length > 1;
  }

  extensionFor(contentType) {
    return MIME_PARA_EXT[contentType] ?? 'bin';
  }

  contextNames() {
    return Object.keys(this.#contexts);
  }
}

MediaValidator.CONTEXTOS = CONTEXTOS;
MediaValidator.MIME_PARA_EXT = MIME_PARA_EXT;

module.exports = MediaValidator;
