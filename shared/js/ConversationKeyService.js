'use strict';

// =============================================================
// ConversationKeyService.js — Camada: infra
//
// Gerencia o par de chaves ECDH de longo prazo do usuário local,
// persiste no IndexedDB (chave privada non-extractable) e deriva
// a chave AES-GCM-256 de conversa via ECDH + HKDF.
//
// Fluxo:
//   1. inicializar() — carrega ou gera o par de chaves; registra
//      a chave pública no BFF (upsert idempotente).
//   2. obterChaveConversa(convId, peerId) — deriva AES-GCM-256
//      via ECDH(local_private, peer_public) + HKDF. Cache em memória
//      por sessão (nunca persiste a chave derivada).
//
// Segurança:
//   - Chave privada marcada non-extractable no Web Crypto.
//   - CryptoKey objects são armazenados diretamente no IndexedDB
//     (structured-clone — nunca exportados como bytes).
//   - Nenhum segredo é logado ou exposto.
//
// Dependências (globais de browser):
//   MessageCryptoService, ChatApiClient
// =============================================================

class ConversationKeyService {

  static #DB_NAME    = 'barberflow-e2e';
  static #DB_VERSION = 1;
  static #STORE      = 'local_keypair';
  static #KEY_RECORD = 'local';

  // Chave derivada por conversa: Map<conversationId, CryptoKey>
  static #derivedKeys = new Map();

  // Par de chaves local carregado do IndexedDB
  static #keyPair   = null;  // { publicKey: CryptoKey, privateKey: CryptoKey }
  static #pubKeyB64 = null;  // string base64 SPKI

  // Indica se um novo par de chaves foi gerado nesta sessão (IndexedDB estava vazio).
  // true = novo dispositivo ou storage apagado → histórico anterior não decifrável.
  // LIMITAÇÃO CONHECIDA:
  //   - Troca de dispositivo: chave privada NÃO é portável. Histórico cifrado com a
  //     chave anterior mostra "🔒 Mensagem cifrada" — correto por design E2E.
  //   - IndexedDB apagado: mesmo comportamento. Mensagens futuras funcionarão normalmente.
  //   - Múltiplos devices simultaneamente: cada device tem par próprio. Mensagens novas
  //     são cifradas com o par do device remetente. O receptor usa sua chave local
  //     derivando com a chave pública do remetente → ambos chegam ao mesmo segredo ECDH.
  static #keyWasGenerated = false;

  // ═══════════════════════════════════════════════════════════
  // Público
  // ═══════════════════════════════════════════════════════════

  /**
   * Garante que o par de chaves local existe (IndexedDB ou novo).
   * Registra a chave pública no BFF de forma assíncrona (fire-and-forget).
   * Idempotente: chamadas subsequentes retornam imediatamente.
   */
  static async inicializar() {
    if (ConversationKeyService.#keyPair) return;

    const db     = await ConversationKeyService.#abrirDB();
    const stored = await ConversationKeyService.#lerDB(db, ConversationKeyService.#KEY_RECORD);

    if (stored?.publicKey && stored?.privateKey) {
      ConversationKeyService.#keyPair         = { publicKey: stored.publicKey, privateKey: stored.privateKey };
      ConversationKeyService.#pubKeyB64       = stored.publicKeyB64 ?? null;
      ConversationKeyService.#keyWasGenerated = false;
    } else {
      // IndexedDB vazio: novo device ou storage apagado → gera novo par de chaves.
      // Histórico cifrado com chave anterior não será decifrável (limitação E2E by design).
      const kp  = await MessageCryptoService.generateKeyPair();
      const b64 = await MessageCryptoService.exportPublicKey(kp.publicKey);
      await ConversationKeyService.#escreverDB(db, {
        id:           ConversationKeyService.#KEY_RECORD,
        publicKey:    kp.publicKey,
        privateKey:   kp.privateKey,
        publicKeyB64: b64,
      });
      ConversationKeyService.#keyPair         = kp;
      ConversationKeyService.#pubKeyB64       = b64;
      ConversationKeyService.#keyWasGenerated = true;
    }

    // Registra chave no BFF — aguarda para garantir que está disponível antes do envio
    if (ConversationKeyService.#pubKeyB64 && typeof ChatApiClient !== 'undefined') {
      try {
        await ChatApiClient.registrarChavePublica(ConversationKeyService.#pubKeyB64);
      } catch {
        // BFF indisponível — tentará novamente na próxima sessão
        if (typeof LoggerService !== 'undefined') {
          LoggerService.warn('[ConversationKeyService] registro de chave falhou (tentará novamente).');
        }
      }
    }
  }

  /**
   * Retorna a chave AES-GCM-256 para uma conversa.
   * Deriva via ECDH na primeira chamada; usa cache em memória nas demais.
   *
   * @param {string} conversationId
   * @param {string} peerId — UUID do outro participante
   * @returns {Promise<CryptoKey>}
   * @throws {Error} se a chave pública do peer não estiver disponível
   */
  static async obterChaveConversa(conversationId, peerId) {
    const cached = ConversationKeyService.#derivedKeys.get(conversationId);
    if (cached) return cached;

    if (!ConversationKeyService.#keyPair) await ConversationKeyService.inicializar();

    const peerPubKeyB64 = await ConversationKeyService.#buscarChavePublicaPeer(peerId);
    if (!peerPubKeyB64) {
      throw new Error(`Chave pública do destinatário não registrada. E2E indisponível para ${peerId}.`);
    }

    const peerPubKey = await MessageCryptoService.importPublicKey(peerPubKeyB64);
    const aesKey     = await MessageCryptoService.deriveSharedKey(
      ConversationKeyService.#keyPair.privateKey,
      peerPubKey,
    );

    ConversationKeyService.#derivedKeys.set(conversationId, aesKey);
    return aesKey;
  }

  /** Retorna a chave pública local (base64 SPKI). Null se não inicializado. */
  static getPublicKeyB64() {
    return ConversationKeyService.#pubKeyB64;
  }

  /**
   * True se um novo par de chaves foi gerado nesta sessão (storage estava vazio).
   * Útil para exibir aviso ao usuário de que o histórico anterior pode não ser decifrável.
   */
  static wasKeyGenerated() {
    return ConversationKeyService.#keyWasGenerated;
  }

  /** Limpa o cache de sessão (chamar no logout). */
  static limpar() {
    ConversationKeyService.#derivedKeys.clear();
    ConversationKeyService.#keyPair         = null;
    ConversationKeyService.#pubKeyB64       = null;
    ConversationKeyService.#keyWasGenerated = false;
  }

  // ═══════════════════════════════════════════════════════════
  // Privados
  // ═══════════════════════════════════════════════════════════

  static async #buscarChavePublicaPeer(peerId) {
    if (typeof ChatApiClient === 'undefined') return null;
    try {
      const { data, error } = await ChatApiClient.obterChavePublicaUsuario(peerId);
      if (error || !data?.publicKey) return null;
      return data.publicKey;
    } catch {
      return null;
    }
  }

  // ── IndexedDB helpers ────────────────────────────────────────

  static #abrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(ConversationKeyService.#DB_NAME, ConversationKeyService.#DB_VERSION);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(ConversationKeyService.#STORE, { keyPath: 'id' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  static #lerDB(db, id) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(ConversationKeyService.#STORE, 'readonly');
      const req = tx.objectStore(ConversationKeyService.#STORE).get(id);
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  static #escreverDB(db, record) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(ConversationKeyService.#STORE, 'readwrite');
      const req = tx.objectStore(ConversationKeyService.#STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }
}

if (typeof window !== 'undefined') window.ConversationKeyService = ConversationKeyService;
