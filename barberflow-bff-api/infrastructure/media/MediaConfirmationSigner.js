'use strict';

const crypto = require('node:crypto');

/**
 * MediaConfirmationSigner - HMAC curto para vincular confirmacao a reserva.
 */
class MediaConfirmationSigner {
  #secret;

  constructor(secret = process.env.MEDIA_CONFIRM_SECRET ?? process.env.SUPABASE_JWT_SECRET) {
    const fallback = process.env.APP_ENV === 'production' ? null : 'barberflow-media-dev-confirmation-secret';
    if (!secret && !fallback) throw new TypeError('MediaConfirmationSigner: secret e obrigatorio');
    this.#secret = secret ?? fallback;
  }

  sign(payload) {
    const body = MediaConfirmationSigner.#encode(payload);
    return `${body}.${this.#digest(body)}`;
  }

  verify(token, expected) {
    const [body, signature] = String(token ?? '').split('.');
    if (!body || !signature || !MediaConfirmationSigner.#safeEqual(signature, this.#digest(body))) return false;
    const payload = MediaConfirmationSigner.#decode(body);
    if (!payload || Date.parse(payload.expiresAt) <= Date.now()) return false;
    return ['mediaId', 'ownerId', 'context', 'path']
      .every(key => String(payload[key] ?? '') === String(expected?.[key] ?? ''));
  }

  #digest(body) {
    return crypto.createHmac('sha256', this.#secret).update(body).digest('base64url');
  }

  static #encode(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  static #decode(body) {
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  static #safeEqual(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

module.exports = { MediaConfirmationSigner };
