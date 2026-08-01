export class AnalyticsSecurity {
  constructor({ allowedOrigin, hmacSecret, maxPayloadBytes = 16 * 1024 }) {
    this.allowedOrigin = allowedOrigin;
    this.hmacSecret = hmacSecret;
    this.maxPayloadBytes = maxPayloadBytes;
  }

  isAllowedOrigin(origin) { return origin === this.allowedOrigin; }
  isPayloadWithinLimit(rawPayload) { return new TextEncoder().encode(rawPayload).byteLength <= this.maxPayloadBytes; }
  normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
  async emailHmac(email) { return this.#hmac(this.normalizeEmail(email)); }
  async ipHash(ip) { return this.#hmac(String(ip || 'unknown')); }

  async #hmac(value) {
    if (!this.hmacSecret) throw new Error('Analytics HMAC secret is not configured');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(this.hmacSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
    return Array.from(new Uint8Array(signature), (part) => part.toString(16).padStart(2, '0')).join('');
  }
}
