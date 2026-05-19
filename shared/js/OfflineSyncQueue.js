'use strict';

// =============================================================
// OfflineSyncQueue.js — Fila offline para Background Sync (POO, static)
//
// Responsabilidades:
//   - Persistir requests pendentes no IndexedDB quando offline
//   - Registrar Background Sync tag para replay automático ao voltar online
//   - Expor dequeue/concluir para o Service Worker processar a fila
//   - Purgar entradas expiradas (TTL 48h)
//
// Banco:  barberflow-sync (IndexedDB)
// Store:  queue
// Schema: { id (autoincrement), tag, url, method, headers, body, createdAt, retries }
//
// Uso no código de app (ex: ao enviar mensagem offline):
//   await OfflineSyncQueue.enqueue({ tag: 'bf-sync-queue', url: '/api/...', method: 'POST', body: JSON.stringify(payload) });
//
// Uso no Service Worker (sync handler):
//   const pendentes = await OfflineSyncQueue.dequeue('bf-sync-queue');
//   for (const entry of pendentes) { ... await OfflineSyncQueue.concluir(entry.id); }
//
// Dependências: IndexedDB (browser nativo), SyncManager (ServiceWorkerRegistration.sync)
// =============================================================

class OfflineSyncQueue {

  // ── Constantes privadas ──────────────────────────────────────────────────
  static #DB_NAME    = 'barberflow-sync';
  static #DB_VERSION = 1;
  static #STORE_NAME = 'queue';

  /** TTL padrão: 48 horas */
  static #TTL_MS = 48 * 60 * 60 * 1000;

  /** Promessa de abertura do banco (singleton). */
  static #dbPromise = null;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica se IndexedDB está disponível.
   * @returns {boolean}
   */
  static suportado() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /**
   * Persiste um request pendente no IDB e registra a tag de Background Sync.
   * Fire-and-forget: a tag registra o SW para replay quando a conexão retornar.
   *
   * @param {{ tag: string, url: string, method?: string, headers?: object, body?: string|null }} opts
   */
  static async enqueue({ tag, url, method = 'POST', headers = {}, body = null }) {
    if (!OfflineSyncQueue.suportado()) return;

    const db    = await OfflineSyncQueue.#abrirBanco();
    const entry = { tag, url, method, headers, body, createdAt: Date.now(), retries: 0 };

    await new Promise((resolve, reject) => {
      const tx    = db.transaction(OfflineSyncQueue.#STORE_NAME, 'readwrite');
      const store = tx.objectStore(OfflineSyncQueue.#STORE_NAME);
      const req   = store.add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });

    // Solicita replay ao browser quando a rede retornar
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if ('sync' in reg) await reg.sync.register(tag);
      }
    } catch { /* BackgroundSync não suportado — graceful */ }
  }

  /**
   * Retorna todos os entries pendentes para a tag fornecida.
   * Chamado pelo Service Worker no handler de sync.
   *
   * @param {string} tag
   * @returns {Promise<Array>}
   */
  static async dequeue(tag) {
    if (!OfflineSyncQueue.suportado()) return [];

    const db = await OfflineSyncQueue.#abrirBanco();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(OfflineSyncQueue.#STORE_NAME, 'readonly');
      const store = tx.objectStore(OfflineSyncQueue.#STORE_NAME);
      const index = store.index('tag');
      const req   = index.getAll(tag);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Remove uma entrada da fila após replay bem-sucedido (ou erro definitivo 4xx).
   *
   * @param {number} id — chave primária da entrada
   */
  static async concluir(id) {
    if (!OfflineSyncQueue.suportado()) return;

    const db = await OfflineSyncQueue.#abrirBanco();
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(OfflineSyncQueue.#STORE_NAME, 'readwrite');
      const store = tx.objectStore(OfflineSyncQueue.#STORE_NAME);
      const req   = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Remove entradas com `createdAt` mais antigo que `maxAgeMs`.
   * Chamado pelo Service Worker no handler `bf-sync-cleanup`.
   *
   * @param {number} [maxAgeMs] — padrão 48h
   * @returns {Promise<number>} — quantidade de entradas removidas
   */
  static async limparExpirados(maxAgeMs = OfflineSyncQueue.#TTL_MS) {
    if (!OfflineSyncQueue.suportado()) return 0;

    const db        = await OfflineSyncQueue.#abrirBanco();
    const threshold = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const tx      = db.transaction(OfflineSyncQueue.#STORE_NAME, 'readwrite');
      const store   = tx.objectStore(OfflineSyncQueue.#STORE_NAME);
      const req     = store.openCursor();
      let   removed = 0;

      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(removed); return; }
        if (cursor.value.createdAt < threshold) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre (ou reutiliza) o banco IndexedDB.
   * Cria a store + índice na primeira abertura (onupgradeneeded).
   * @returns {Promise<IDBDatabase>}
   */
  static #abrirBanco() {
    if (OfflineSyncQueue.#dbPromise) return OfflineSyncQueue.#dbPromise;

    OfflineSyncQueue.#dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(OfflineSyncQueue.#DB_NAME, OfflineSyncQueue.#DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(OfflineSyncQueue.#STORE_NAME)) {
          const store = db.createObjectStore(
            OfflineSyncQueue.#STORE_NAME,
            { keyPath: 'id', autoIncrement: true },
          );
          store.createIndex('tag', 'tag', { unique: false });
        }
      };

      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => {
        OfflineSyncQueue.#dbPromise = null; // permite retry em caso de erro transiente
        reject(e.target.error);
      };
    });

    return OfflineSyncQueue.#dbPromise;
  }
}
