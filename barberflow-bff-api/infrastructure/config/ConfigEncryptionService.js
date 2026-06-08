'use strict';

const crypto = require('node:crypto');

// ============================================================
// ConfigEncryptionService — AES-256-GCM para credenciais do
// sistema (Cloudflare R2 etc.).
//
// Chave de 32 bytes (256 bits) lida de ADMIN_ENCRYPT_KEY
// como string hex de 64 caracteres.
//
// Formato de saída: { valueEnc, iv, authTag } — todos base64url.
// IV de 12 bytes gerado aleatoriamente por operação de encrypt.
// ============================================================

const DEV_KEY_HEX = '0'.repeat(64);
const ALGORITHM   = 'aes-256-gcm';

class ConfigEncryptionService {

  /** @type {Buffer} */
  #key;

  constructor() {
    const raw = process.env.ADMIN_ENCRYPT_KEY ?? '';

    if (!raw || raw.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(raw)) {
      if (process.env.NODE_ENV === 'production') {
        // Não lança aqui para não derrubar o startup do BFF.
        // O erro é lançado apenas em encrypt()/decrypt() — rotas admin
        // retornam 500 enquanto ADMIN_ENCRYPT_KEY não estiver configurada.
        this.#key = null;
      } else {
        // Em dev/test usa chave nula com aviso — nunca em produção.
        console.warn(
          '[ConfigEncryptionService] ADMIN_ENCRYPT_KEY não configurada. ' +
          'Usando chave de desenvolvimento (INSEGURO — apenas dev/test).'
        );
        this.#key = Buffer.from(DEV_KEY_HEX, 'hex');
      }
    } else {
      this.#key = Buffer.from(raw, 'hex');
    }
  }

  /**
   * Encripta um valor em claro com AES-256-GCM.
   * @param {string} plaintext
   * @returns {{ valueEnc: string, iv: string, authTag: string }}
   */
  encrypt(plaintext) {
    if (!this.#key) throw new Error('[ConfigEncryptionService] ADMIN_ENCRYPT_KEY não configurada. Defina uma string hex de 64 caracteres nas variáveis de ambiente.');
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.#key, iv);

    const enc = Buffer.concat([
      cipher.update(String(plaintext), 'utf8'),
      cipher.final(),
    ]);

    return {
      valueEnc: enc.toString('base64url'),
      iv:       iv.toString('base64url'),
      authTag:  cipher.getAuthTag().toString('base64url'),
    };
  }

  /**
   * Decripta um valor previamente encriptado.
   * @param {{ valueEnc: string, iv: string, authTag: string }} params
   * @returns {string}
   * @throws {Error} se os dados forem inválidos ou adulterados
   */
  decrypt({ valueEnc, iv, authTag }) {
    if (!this.#key) throw new Error('[ConfigEncryptionService] ADMIN_ENCRYPT_KEY não configurada. Defina uma string hex de 64 caracteres nas variáveis de ambiente.');
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.#key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    const plain = Buffer.concat([
      decipher.update(Buffer.from(valueEnc, 'base64url')),
      decipher.final(),
    ]);

    return plain.toString('utf8');
  }
}

module.exports = { ConfigEncryptionService };
