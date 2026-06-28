'use strict';

const crypto = require('node:crypto');

// ============================================================
// DocumentCipher — AES-256-GCM para documentos de identificação
// (CPF/CNPJ). Chave dedicada: DOC_ENCRYPT_KEY (fallback: ADMIN_ENCRYPT_KEY).
//
// Formato armazenado: JSON compacto {v, i, t} onde
//   v = ciphertext em base64url
//   i = IV de 12 bytes em base64url
//   t = authTag de 16 bytes em base64url
//
// Uso: DocumentCipher.encrypt('12345678901') → string JSON
//      DocumentCipher.tryDecrypt(enc)        → '12345678901' | null
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const DEV_HEX   = '0'.repeat(64);

let _key = null;

function _loadKey() {
  if (_key) return _key;

  const raw = process.env.DOC_ENCRYPT_KEY ?? process.env.ADMIN_ENCRYPT_KEY ?? '';

  if (!raw || raw.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
    console.warn(
      '[DocumentCipher] DOC_ENCRYPT_KEY ausente — usando chave de dev (inseguro).',
    );
    _key = Buffer.from(DEV_HEX, 'hex');
  } else {
    _key = Buffer.from(raw, 'hex');
  }

  return _key;
}

class DocumentCipher {
  /**
   * Encripta plaintext e retorna string JSON armazenável em coluna TEXT.
   * @param {string} plaintext
   * @returns {string}
   */
  static encrypt(plaintext) {
    const key = _loadKey();
    if (!key) throw new Error('[DocumentCipher] DOC_ENCRYPT_KEY não configurada.');

    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ct     = Buffer.concat([
      cipher.update(String(plaintext), 'utf8'),
      cipher.final(),
    ]);

    return JSON.stringify({
      v: ct.toString('base64url'),
      i: iv.toString('base64url'),
      t: cipher.getAuthTag().toString('base64url'),
    });
  }

  /**
   * Decripta uma string produzida por encrypt().
   * @param {string} enc
   * @returns {string}
   */
  static decrypt(enc) {
    const key = _loadKey();
    if (!key) throw new Error('[DocumentCipher] DOC_ENCRYPT_KEY não configurada.');

    const { v, i, t } = JSON.parse(enc);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(i, 'base64url'));
    decipher.setAuthTag(Buffer.from(t, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(v, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Versão defensiva: retorna null em caso de qualquer falha
   * (coluna corrompida, chave ausente, dado de outra versão).
   * @param {string|null} enc
   * @returns {string|null}
   */
  static tryDecrypt(enc) {
    if (!enc) return null;
    try { return DocumentCipher.decrypt(enc); } catch { return null; }
  }
}

module.exports = DocumentCipher;
