'use strict';

// =============================================================
// MessageCryptoService.js — Criptografia E2E para mensagens P2P.
//
// Algoritmo:
//   ECDH P-256  → troca de chaves públicas (via DataChannel, nunca sinalização)
//   HKDF SHA-256 → deriva chave AES-GCM-256 do segredo ECDH compartilhado
//   AES-GCM-256  → cifra cada mensagem com IV aleatório de 12 bytes
//
// Garantias de segurança:
//   - Chave privada marcada non-extractable; nunca exposta em logs
//   - IV único por mensagem (12 bytes aleatórios via crypto.getRandomValues)
//   - Payload trafega como { iv: base64, ct: base64 } — sem texto puro
//   - Nenhum método grava conteúdo em console/logger
//
// Dependências: Web Crypto API nativa (browser) / globalThis.crypto (Node 18+)
// =============================================================

class MessageCryptoService {

  // ─── Constantes ─────────────────────────────────────────────
  static #CURVE     = 'P-256';
  static #AES_ALG   = 'AES-GCM';
  static #AES_LEN   = 256;
  static #IV_BYTES  = 12;
  static #HKDF_HASH = 'SHA-256';
  static #HKDF_INFO = new TextEncoder().encode('BarberFlow-Chat-v1');

  // ─── Acesso à API de cripto ──────────────────────────────────
  static get #crypto() {
    return (typeof window !== 'undefined' ? window.crypto : globalThis.crypto);
  }

  static get #subtle() {
    return MessageCryptoService.#crypto.subtle;
  }

  // ═══════════════════════════════════════════════════════════
  // Público
  // ═══════════════════════════════════════════════════════════

  /**
   * Gera par de chaves ECDH P-256 para a sessão.
   * A chave privada é marcada non-extractable e nunca deve ser logada.
   *
   * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
   */
  static async generateKeyPair() {
    return MessageCryptoService.#subtle.generateKey(
      { name: 'ECDH', namedCurve: MessageCryptoService.#CURVE },
      false,        // non-extractable: chave privada não pode ser exportada
      ['deriveKey'],
    );
  }

  /**
   * Exporta a chave pública como string base64 (formato SPKI).
   * Somente a chave PÚBLICA é exportável.
   *
   * @param {CryptoKey} publicKey
   * @returns {Promise<string>} base64
   */
  static async exportPublicKey(publicKey) {
    const buf = await MessageCryptoService.#subtle.exportKey('spki', publicKey);
    return MessageCryptoService.#bufToB64(buf);
  }

  /**
   * Importa chave pública recebida do peer (base64 SPKI).
   *
   * @param {string} b64
   * @returns {Promise<CryptoKey>}
   */
  static async importPublicKey(b64) {
    const buf = MessageCryptoService.#b64ToBuf(b64);
    return MessageCryptoService.#subtle.importKey(
      'spki',
      buf,
      { name: 'ECDH', namedCurve: MessageCryptoService.#CURVE },
      false,
      [],
    );
  }

  /**
   * Deriva chave AES-GCM compartilhada via ECDH + HKDF.
   * Ambos os lados (A e B) derivam a mesma chave usando seus respectivos
   * private+remote_public key pairs.
   *
   * @param {CryptoKey} privateKey  — chave privada local (ECDH)
   * @param {CryptoKey} remotePubKey — chave pública do peer (ECDH)
   * @returns {Promise<CryptoKey>}  — chave AES-GCM-256
   */
  static async deriveSharedKey(privateKey, remotePubKey) {
    const ecdhSecret = await MessageCryptoService.#subtle.deriveKey(
      { name: 'ECDH', public: remotePubKey },
      privateKey,
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    );

    return MessageCryptoService.#subtle.deriveKey(
      {
        name:   'HKDF',
        hash:   MessageCryptoService.#HKDF_HASH,
        salt:   new Uint8Array(32),         // salt fixo público — segurança via ECDH
        info:   MessageCryptoService.#HKDF_INFO,
      },
      ecdhSecret,
      { name: MessageCryptoService.#AES_ALG, length: MessageCryptoService.#AES_LEN },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Criptografa uma mensagem de texto puro com a chave AES-GCM compartilhada.
   * O IV é único por chamada (12 bytes aleatórios).
   *
   * @param {string}    plainText — texto a cifrar
   * @param {CryptoKey} aesKey    — chave AES-GCM-256 derivada via ECDH
   * @returns {Promise<{iv: string, ct: string}>}
   */
  static async encryptMessage(plainText, aesKey) {
    const iv       = MessageCryptoService.#crypto.getRandomValues(new Uint8Array(MessageCryptoService.#IV_BYTES));
    const encoded  = new TextEncoder().encode(plainText);
    const cipherBuf = await MessageCryptoService.#subtle.encrypt(
      { name: MessageCryptoService.#AES_ALG, iv },
      aesKey,
      encoded,
    );

    return {
      iv: MessageCryptoService.#bufToB64(iv.buffer),
      ct: MessageCryptoService.#bufToB64(cipherBuf),
    };
  }

  /**
   * Descriptografa um payload `{ iv, ct }` com a chave AES-GCM compartilhada.
   *
   * @param {{iv: string, ct: string}} payload
   * @param {CryptoKey}                aesKey
   * @returns {Promise<string>} texto puro
   * @throws {Error} se o payload for inválido ou a descriptografia falhar
   */
  static async decryptMessage(payload, aesKey) {
    if (!MessageCryptoService.validateEncryptedPayload(payload)) {
      throw new Error('Payload de mensagem inválido.');
    }

    const iv        = MessageCryptoService.#b64ToBuf(payload.iv);
    const cipherBuf = MessageCryptoService.#b64ToBuf(payload.ct);

    const plainBuf = await MessageCryptoService.#subtle.decrypt(
      { name: MessageCryptoService.#AES_ALG, iv },
      aesKey,
      cipherBuf,
    );

    return new TextDecoder().decode(plainBuf);
  }

  /**
   * Valida estrutura mínima de um payload criptografado.
   * Retorna false para qualquer payload que não seja { iv: string, ct: string }.
   *
   * @param {unknown} payload
   * @returns {boolean}
   */
  static validateEncryptedPayload(payload) {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      typeof payload.iv === 'string' && payload.iv.length > 0 &&
      typeof payload.ct === 'string' && payload.ct.length > 0
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — utilitários de codificação
  // ═══════════════════════════════════════════════════════════

  /** @param {ArrayBuffer} buf @returns {string} */
  static #bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  /** @param {string} b64 @returns {ArrayBuffer} */
  static #b64ToBuf(b64) {
    const bin  = atob(b64);
    const buf  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
}
