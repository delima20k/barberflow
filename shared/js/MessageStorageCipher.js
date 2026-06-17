'use strict';

// =============================================================
// MessageStorageCipher.js — Camada: infra
//
// Implementação de criptografia E2E para persistência no BFF/banco.
// Usa MessageCryptoService (AES-GCM-256) + ConversationKeyService
// (deriva a chave de conversa via ECDH de longo prazo).
//
// Payload de armazenamento:
//   { v: 1, alg: "AES-GCM-256", iv: string, ct: string, kid: string }
//   v   — versão do schema (rotação futura sem reescrever histórico)
//   alg — algoritmo para auditoria e compatibilidade
//   iv  — nonce AES-GCM (12 bytes, base64)
//   ct  — ciphertext (base64)
//   kid — peerId: identifica qual chave pública foi usada; o
//          receptor sabe qual chave derivar (ECDH com o remetente)
//
// Garantias:
//   - BFF nunca vê texto puro
//   - Descriptografia ocorre somente no browser do participante
//   - Falhas de descriptografia retornam null (não lançam para o UI)
//   - Nenhum texto puro é logado
//
// Dependências (globais de browser):
//   MessageCryptoService, ConversationKeyService
// =============================================================

class MessageStorageCipher {

  static #SCHEMA_VERSION = 1;
  static #ALGORITHM      = 'AES-GCM-256';

  // ═══════════════════════════════════════════════════════════
  // Público
  // ═══════════════════════════════════════════════════════════

  /**
   * Cifra o texto puro para armazenamento no BFF.
   *
   * @param {string} conversationId
   * @param {string} peerId  — UUID do outro participante
   * @param {string} plainText
   * @returns {Promise<{v:number, alg:string, iv:string, ct:string, kid:string}>}
   * @throws {Error} se a chave do peer não estiver disponível
   */
  static async encryptForStorage(conversationId, peerId, plainText) {
    const aesKey      = await ConversationKeyService.obterChaveConversa(conversationId, peerId);
    const { iv, ct }  = await MessageCryptoService.encryptMessage(plainText, aesKey);
    const publicKeys  = await MessageStorageCipher.#publicKeys(peerId);
    const payload = {
      v:   MessageStorageCipher.#SCHEMA_VERSION,
      alg: MessageStorageCipher.#ALGORITHM,
      iv,
      ct,
      kid: peerId,
    };

    if (publicKeys.senderPublicKey) payload.senderPublicKey = publicKeys.senderPublicKey;
    if (publicKeys.recipientPublicKey) payload.recipientPublicKey = publicKeys.recipientPublicKey;

    return payload;
  }

  /**
   * Decifra um payload de armazenamento.
   * Retorna null em caso de falha (chave errada, payload corrompido, peer sem chave).
   *
   * @param {string} conversationId
   * @param {string} peerId  — UUID do outro participante
   * @param {{v:number, alg:string, iv:string, ct:string, kid?:string}} encryptedPayload
   * @returns {Promise<string|null>}
   */
  static async decryptFromStorage(conversationId, peerId, encryptedPayload) {
    if (!MessageStorageCipher.validarPayload(encryptedPayload)) return null;

    const embeddedKeys = MessageStorageCipher.#embeddedPublicKeys(encryptedPayload);
    for (const publicKeyB64 of embeddedKeys) {
      const plainText = await MessageStorageCipher.#tryDecryptWithPublicKey(encryptedPayload, publicKeyB64);
      if (plainText !== null) return plainText;
    }

    try {
      const aesKey = await ConversationKeyService.obterChaveConversa(conversationId, peerId);
      return await MessageCryptoService.decryptMessage(encryptedPayload, aesKey);
    } catch {
      return null;
    }
  }

  /**
   * Valida a estrutura mínima do payload de armazenamento.
   * Não descriptografa — apenas verifica os campos obrigatórios.
   *
   * @param {unknown} payload
   * @returns {boolean}
   */
  static validarPayload(payload) {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      typeof payload.v   === 'number' &&
      typeof payload.alg === 'string' && payload.alg.length > 0 &&
      typeof payload.iv  === 'string' && payload.iv.length  > 0 &&
      typeof payload.ct  === 'string' && payload.ct.length  > 0
    );
  }

  static async #publicKeys(peerId) {
    return {
      senderPublicKey: await MessageStorageCipher.#safeString(() => ConversationKeyService.getPublicKeyB64?.()),
      recipientPublicKey: await MessageStorageCipher.#safeString(() => (
        ConversationKeyService.obterChavePublicaPeer?.(peerId)
      )),
    };
  }

  static #embeddedPublicKeys(encryptedPayload) {
    return [
      encryptedPayload.senderPublicKey,
      encryptedPayload.recipientPublicKey,
    ].filter((key, index, keys) => (
      typeof key === 'string' &&
      key.length > 0 &&
      keys.indexOf(key) === index
    ));
  }

  static async #tryDecryptWithPublicKey(encryptedPayload, publicKeyB64) {
    if (typeof ConversationKeyService.derivarChaveComPublicKey !== 'function') return null;

    try {
      const aesKey = await ConversationKeyService.derivarChaveComPublicKey(publicKeyB64);
      return await MessageCryptoService.decryptMessage(encryptedPayload, aesKey);
    } catch {
      return null;
    }
  }

  static async #safeString(getter) {
    try {
      const value = await getter();
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }
}

if (typeof window !== 'undefined') window.MessageStorageCipher = MessageStorageCipher;
