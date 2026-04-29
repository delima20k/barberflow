'use strict';

// =============================================================
// ResourceLoader.js — Carregamento de recursos com cache-busting
//
// Responsabilidade única: fornecer URLs de imagens e vídeos com
// parâmetro de cache-busting (?v=timestamp), e buscar dados da
// API com integração ao CacheManager.
//
// Cache-busting é renovado via invalidateBust() — chamado automaticamente
// pelo StateManager ao trocar de contexto (ex: nova barbearia).
//
// Dependências: CacheManager.js
// =============================================================

class ResourceLoader {

  // Timestamp do último bust — 0 até a primeira troca de contexto
  static #bust = 0;

  // ══════════════════════════════════════════════════════════
  // CACHE-BUSTING
  // ══════════════════════════════════════════════════════════

  /**
   * Renova o timestamp de cache-busting.
   * Chamado pelo StateManager ao trocar de contexto.
   */
  static invalidateBust() {
    ResourceLoader.#bust = Date.now();
  }

  /**
   * Injeta o parâmetro `?v={bust}` em uma URL.
   * Se bust === 0 (nenhuma troca de contexto ainda), retorna a URL original.
   * @param {string} url
   * @returns {string}
   */
  static #aplicarBust(url) {
    if (!url || ResourceLoader.#bust === 0) return url;
    return url.includes('?') ? `${url}&v=${ResourceLoader.#bust}` : `${url}?v=${ResourceLoader.#bust}`;
  }

  // ══════════════════════════════════════════════════════════
  // IMAGENS E VÍDEOS
  // ══════════════════════════════════════════════════════════

  /**
   * Retorna a URL de uma imagem com parâmetro de cache-busting.
   * @param {string} url — URL original da imagem
   * @returns {string}
   */
  static loadImage(url) {
    return ResourceLoader.#aplicarBust(url);
  }

  /**
   * Retorna a URL de um vídeo com parâmetro de cache-busting.
   * @param {string} url — URL original do vídeo
   * @returns {string}
   */
  static loadVideo(url) {
    return ResourceLoader.#aplicarBust(url);
  }

  // ══════════════════════════════════════════════════════════
  // DADOS
  // ══════════════════════════════════════════════════════════

  /**
   * Busca dados de um endpoint com cache opcional via CacheManager.
   * Se cacheKey for fornecida e houver cache válido, retorna sem rede.
   * Caso contrário, faz fetch e armazena o resultado se cacheKey definida.
   *
   * @param {string}      endpoint  — URL do endpoint
   * @param {string|null} [cacheKey=null] — chave para armazenamento no CacheManager
   * @param {number}      [ttlMs=5 * 60 * 1000] — TTL em ms (padrão: 5 min)
   * @returns {Promise<*>} — dados parseados como JSON
   * @throws {Error} se o fetch falhar ou a resposta não for ok
   */
  static async fetchData(endpoint, cacheKey = null, ttlMs = 5 * 60 * 1000) {
    if (cacheKey) {
      const cached = CacheManager.get(cacheKey);
      if (cached !== null) return cached;
    }

    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`[ResourceLoader] fetch falhou: ${response.status} ${endpoint}`);

    const data = await response.json();

    if (cacheKey) CacheManager.set(cacheKey, data, ttlMs);

    return data;
  }
}
