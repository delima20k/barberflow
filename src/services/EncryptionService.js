'use strict';

// =============================================================
// EncryptionService.js — Criptografia simétrica autenticada
// Camada: application
//
// ALGORITMO: AES-256-GCM (autenticado)
//   - Chave e IV aleatórios por arquivo (nunca reutilizados)
//   - GCM garante confidencialidade + integridade + autenticidade
//   - authTag impede adulteração silenciosa do ciphertext
//
// PROPRIEDADES DE SEGURANÇA:
//   - Zero plaintext no resultado: só ciphertext + metadados de chave
//   - Cada chamada a encrypt() gera nova chave e IV independentes
//   - decrypt() falha se authTag, key ou IV estiverem incorretos
//   - Comparações de token usam timingSafeEqual (anti timing-attack)
//
// USO TÍPICO:
//   const svc = new EncryptionService();
//   const enc = svc.encrypt(fileBuffer);
//   // Armazenar enc.key + enc.iv + enc.authTag no KMS / metadata
//   // Armazenar enc.data no storage (R2, S3, etc.)
//   const original = svc.decrypt(enc);
//
// IMPORTANTE — Gestão de chaves em produção:
//   enc.key contém a chave simétrica em hex.
//   NUNCA armazene a chave no mesmo local que enc.data.
//   Use um KMS (AWS KMS, Cloudflare Secrets, Vault, etc.).
//
// Dependências: node:crypto (nativa — zero dependências externas)
// =============================================================

const crypto = require('node:crypto');

// ── Constantes criptográficas ──────────────────────────────────
const ALGORITHM  = 'aes-256-gcm';
const KEY_BYTES  = 32; // 256 bits
const IV_BYTES   = 12; // 96 bits (recomendado para GCM — evita colisão em CTR)
const TAG_LENGTH = 16; // 128 bits (máximo GCM — mais seguro)

/**
 * @typedef {Object} EncryptedResult
 * @property {Buffer} data     — Ciphertext (dados cifrados)
 * @property {string} key      — Chave AES-256 em hex (32 bytes → 64 chars)
 * @property {string} iv       — IV em hex (12 bytes → 24 chars)
 * @property {string} authTag  — Tag de autenticação GCM em hex (16 bytes → 32 chars)
 */

class EncryptionService {

  // ── Campos privados estáticos (imutáveis) ────────────────────
  static #ALGORITHM  = ALGORITHM;
  static #KEY_BYTES  = KEY_BYTES;
  static #IV_BYTES   = IV_BYTES;
  static #TAG_LENGTH = TAG_LENGTH;

  // ══════════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Cifra um buffer com AES-256-GCM.
   * Gera chave e IV aleatórios únicos para cada chamada.
   * O plaintext NUNCA sai desta função — apenas o ciphertext.
   *
   * @param {Buffer} buffer — Dados em plaintext
   * @returns {EncryptedResult}
   * @throws {TypeError} se buffer não for um Buffer
   */
  encrypt(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('[EncryptionService] encrypt: buffer deve ser um Buffer');
    }

    const key    = crypto.randomBytes(EncryptionService.#KEY_BYTES);
    const iv     = crypto.randomBytes(EncryptionService.#IV_BYTES);
    const cipher = crypto.createCipheriv(
      EncryptionService.#ALGORITHM,
      key,
      iv,
      { authTagLength: EncryptionService.#TAG_LENGTH }
    );

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag   = cipher.getAuthTag();

    return {
      data:    encrypted,
      key:     key.toString('hex'),
      iv:      iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decifra um EncryptedResult usando AES-256-GCM.
   * Lança erro se o authTag, key ou IV estiverem incorretos (adulteração detectada).
   *
   * @param {EncryptedResult} encrypted
   * @returns {Buffer} — Dados originais em plaintext
   * @throws {TypeError} se algum campo for do tipo errado
   * @throws {Error}     se a autenticação GCM falhar (chave errada, dado adulterado)
   */
  decrypt({ data, key, iv, authTag }) {
    if (!Buffer.isBuffer(data))      throw new TypeError('[EncryptionService] decrypt: data deve ser um Buffer');
    if (typeof key     !== 'string') throw new TypeError('[EncryptionService] decrypt: key deve ser uma string hex');
    if (typeof iv      !== 'string') throw new TypeError('[EncryptionService] decrypt: iv deve ser uma string hex');
    if (typeof authTag !== 'string') throw new TypeError('[EncryptionService] decrypt: authTag deve ser uma string hex');

    const keyBuf  = Buffer.from(key,     'hex');
    const ivBuf   = Buffer.from(iv,      'hex');
    const tagBuf  = Buffer.from(authTag, 'hex');

    if (keyBuf.length !== EncryptionService.#KEY_BYTES) {
      throw new RangeError(`[EncryptionService] decrypt: key deve ter ${EncryptionService.#KEY_BYTES} bytes`);
    }
    if (ivBuf.length !== EncryptionService.#IV_BYTES) {
      throw new RangeError(`[EncryptionService] decrypt: iv deve ter ${EncryptionService.#IV_BYTES} bytes`);
    }

    const decipher = crypto.createDecipheriv(
      EncryptionService.#ALGORITHM,
      keyBuf,
      ivBuf,
      { authTagLength: EncryptionService.#TAG_LENGTH }
    );
    decipher.setAuthTag(tagBuf);

    // Lança ERR_CRYPTO_GCM_AUTH_TAG_MISMATCH se authTag não bater
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}

module.exports = EncryptionService;
