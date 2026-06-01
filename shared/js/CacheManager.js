'use strict';

// =============================================================
// CacheManager.js — Cache em memória com TTL e escopo
//
// Responsabilidade única: armazenar e invalidar valores em memória
// com suporte a TTL (tempo de vida) e limpeza por escopo (prefixo).
//
// Uso:
//   CacheManager.set('shop:abc', dados, 5 * 60 * 1000);  // TTL 5 min
//   CacheManager.get('shop:abc');                         // → dados ou null
//   CacheManager.invalidate('shop:abc');                  // remove entrada
//   CacheManager.clearScope('shop:abc');                  // remove todas as
//                                                         // chaves "shop:abc:*"
// =============================================================

class CacheManager {

  // Mapa interno: chave → { value: any, expiresAt: number }
  static #store = new Map();

  // ══════════════════════════════════════════════════════════
  // LEITURA
  // ══════════════════════════════════════════════════════════

  /**
   * Retorna o valor armazenado se ainda válido, ou `null` se expirado/ausente.
   * Entradas expiradas são removidas automaticamente (lazy eviction).
   * @param {string} key
   * @returns {*|null}
   */
  static get(key) {
    const entry = CacheManager.#store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      CacheManager.#store.delete(key);
      return null;
    }
    return entry.value;
  }

  // ══════════════════════════════════════════════════════════
  // ESCRITA
  // ══════════════════════════════════════════════════════════

  /**
   * Armazena um valor com TTL em milissegundos.
   * @param {string} key
   * @param {*}      value
   * @param {number} ttlMs — tempo de vida em ms (padrão: 5 minutos)
   */
  static set(key, value, ttlMs = 5 * 60 * 1000) {
    if (typeof key !== 'string' || !key) return;
    if (typeof ttlMs !== 'number' || ttlMs <= 0) return;
    CacheManager.#store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  // ══════════════════════════════════════════════════════════
  // INVALIDAÇÃO
  // ══════════════════════════════════════════════════════════

  /**
   * Remove uma entrada específica do cache.
   * @param {string} key
   */
  static invalidate(key) {
    CacheManager.#store.delete(key);
  }

  /**
   * Remove todas as entradas cujas chaves começam com `${scopeId}:`.
   * Usado para limpar todos os dados de um contexto (ex: uma barbearia)
   * quando o usuário troca de contexto.
   * @param {string} scopeId
   */
  static clearScope(scopeId) {
    if (!scopeId) return;
    const prefix = `${scopeId}:`;
    for (const key of CacheManager.#store.keys()) {
      if (key.startsWith(prefix)) CacheManager.#store.delete(key);
    }
  }

  /**
   * Remove todas as entradas do cache (flush completo).
   * Usar com cuidado — prefira `clearScope` para invalidações pontuais.
   */
  static clear() {
    CacheManager.#store.clear();
  }
}
