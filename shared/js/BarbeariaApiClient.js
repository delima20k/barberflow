'use strict';

// =============================================================
// BarbeariaApiClient.js — Fachada de acesso a dados de barbearias.
//
// Responsabilidades:
//   - Consultar BarbershopRepository (Supabase direto) como fonte primária
//   - Fallback para BffApiService se Supabase não responder
//   - Guards obrigatórios: previne lat/lng inválidos antes da chamada
//
// Consumidores: NearbyBarbershopsWidget
// Dependências: BarbershopRepository.js, BffApiService.js, LoggerService.js
//
// Por que Supabase direto como primário:
//   Os endpoints públicos de barbearias (/api/v1/barbearias) não requerem
//   autenticação. CDNs podem cachear a resposta sem variar por Origin,
//   resultando em header CORS errado para pro.barberflow.live. Usar
//   BarbershopRepository elimina essa dependência de CDN para dados públicos.
// =============================================================

class BarbeariaApiClient {

  static #RAIO_PADRAO_KM  = 5;
  static #LIMIT_DESTAQUE  = 6;
  static #LIMIT_TODAS     = 60;
  static #CACHE_TTL_MS    = 30 * 1000;
  static #cache            = new Map(); // key -> { ts, data }
  static #requestsEmAndamento = new Map(); // key -> Promise<{ data, cachear }>
  static #ultimoAvisoMs    = 0;
  static #AVISO_THROTTLE_MS = 60_000;
  static #bffFalhou        = false;

  // ── API pública ──────────────────────────────────────────────────

  /** Retorna true se o último fetch falhou (Supabase e BFF). */
  static get bffIndisponivel() { return BarbeariaApiClient.#bffFalhou; }

  /**
   * Invalida caches curtos de listagem.
   * @param {string|null} prefixo
   */
  static invalidarCache(prefixo = null) {
    if (!prefixo) {
      BarbeariaApiClient.#cache.clear();
      return;
    }
    for (const chave of BarbeariaApiClient.#cache.keys()) {
      if (chave === prefixo || chave.startsWith(`${prefixo}:`)) {
        BarbeariaApiClient.#cache.delete(chave);
      }
    }
  }

  /**
   * Lista barbearias próximas à coordenada informada.
   * Primário: BarbershopRepository (Supabase direto, sem CORS via CDN).
   * Fallback: BFF.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} [raioKm=5]
   * @returns {Promise<object[]>}
   */
  static async getNearby(lat, lng, raioKm = BarbeariaApiClient.#RAIO_PADRAO_KM) {
    BarbeariaApiClient.#validarCoordenadas(lat, lng);

    const chave = ['nearby', Number(lat).toFixed(3), Number(lng).toFixed(3), Number(raioKm)].join(':');

    return BarbeariaApiClient.#comCache(chave, async () => {
      // Primário: Supabase direto
      try {
        if (typeof BarbershopRepository !== 'undefined') {
          const data = await BarbershopRepository.getNearby(lat, lng, raioKm);
          if (Array.isArray(data)) {
            BarbeariaApiClient.#bffFalhou = false;
            return { data, cachear: true };
          }
        }
      } catch (_) { /* fallthrough para BFF */ }

      // Fallback: BFF
      const { data, error } = await BffApiService.get('/api/v1/barbearias', { lat, lng, raio: raioKm });
      if (!error && Array.isArray(data)) {
        BarbeariaApiClient.#bffFalhou = false;
        return { data, cachear: true };
      }

      BarbeariaApiClient.#bffFalhou = true;
      BarbeariaApiClient.#logAviso('getNearby', error?.message);
      return { data: [], cachear: false };
    });
  }

  /**
   * Lista barbearias em destaque (top rated).
   * Primário: BarbershopRepository. Fallback: BFF.
   *
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  static async getDestaque(limit = BarbeariaApiClient.#LIMIT_DESTAQUE) {
    const chave = `destaque:${Number(limit)}`;

    return BarbeariaApiClient.#comCache(chave, async () => {
      try {
        if (typeof BarbershopRepository !== 'undefined') {
          const data = await BarbershopRepository.getFeatured(limit);
          if (Array.isArray(data)) {
            BarbeariaApiClient.#bffFalhou = false;
            return { data, cachear: true };
          }
        }
      } catch (_) { /* fallthrough */ }

      const { data, error } = await BffApiService.get('/api/v1/barbearias/destaque', { limit });
      if (!error && Array.isArray(data)) {
        BarbeariaApiClient.#bffFalhou = false;
        return { data, cachear: true };
      }

      BarbeariaApiClient.#bffFalhou = true;
      BarbeariaApiClient.#logAviso('getDestaque', error?.message);
      return { data: [], cachear: false };
    });
  }

  /**
   * Lista todas as barbearias ativas por popularidade.
   * Primário: BarbershopRepository. Fallback: BFF.
   *
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  static async getTodas(limit = BarbeariaApiClient.#LIMIT_TODAS) {
    const chave = `todas:${Number(limit)}`;

    return BarbeariaApiClient.#comCache(chave, async () => {
      try {
        if (typeof BarbershopRepository !== 'undefined') {
          const data = await BarbershopRepository.getAll(limit);
          if (Array.isArray(data)) {
            BarbeariaApiClient.#bffFalhou = false;
            return { data, cachear: true };
          }
        }
      } catch (_) { /* fallthrough */ }

      const { data, error } = await BffApiService.get('/api/v1/barbearias/todas', { limit });
      if (!error && Array.isArray(data)) {
        BarbeariaApiClient.#bffFalhou = false;
        return { data, cachear: true };
      }

      BarbeariaApiClient.#bffFalhou = true;
      BarbeariaApiClient.#logAviso('getTodas', error?.message);
      return { data: [], cachear: false };
    });
  }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Emite LoggerService.warn com throttle: no máximo 1 aviso por
   * #AVISO_THROTTLE_MS para não poluir o console durante indisponibilidade.
   * @param {string} metodo  Nome do método que detectou a falha
   * @param {string} mensagem Detalhe do erro
   */
  static #logAviso(metodo, mensagem) {
    const agora = Date.now();
    if (agora - BarbeariaApiClient.#ultimoAvisoMs < BarbeariaApiClient.#AVISO_THROTTLE_MS) return;
    BarbeariaApiClient.#ultimoAvisoMs = agora;
    LoggerService.warn(`[BarbeariaApiClient] ${metodo}: BFF indisponível.`, mensagem);
  }

  /**
   * Valida que lat e lng são números finitos.
   * Lança TypeError imediatamente para evitar chamada inválida à BFF.
   * @param {number} lat
   * @param {number} lng
   */
  static #validarCoordenadas(lat, lng) {
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
      throw new TypeError(
        `[BarbeariaApiClient] coordenadas inválidas: lat=${lat}, lng=${lng}`,
      );
    }
  }

  /**
   * Deduplica requests iguais e mantém cache curto para o boot da home.
   * @param {string} chave
   * @param {Function} fetcher
   * @returns {Promise<object[]>}
   */
  static async #comCache(chave, fetcher) {
    const cache = BarbeariaApiClient.#cache.get(chave);
    if (cache && Date.now() - cache.ts < BarbeariaApiClient.#CACHE_TTL_MS) {
      return BarbeariaApiClient.#clonarLista(cache.data);
    }

    if (BarbeariaApiClient.#requestsEmAndamento.has(chave)) {
      const resultado = await BarbeariaApiClient.#requestsEmAndamento.get(chave);
      return BarbeariaApiClient.#clonarLista(resultado.data);
    }

    const promise = (async () => {
      const resultado = await fetcher();
      const data = Array.isArray(resultado?.data) ? resultado.data : [];
      if (resultado?.cachear) {
        BarbeariaApiClient.#cache.set(chave, { ts: Date.now(), data });
      }
      return { data, cachear: !!resultado?.cachear };
    })();

    BarbeariaApiClient.#requestsEmAndamento.set(chave, promise);
    try {
      const resultado = await promise;
      return BarbeariaApiClient.#clonarLista(resultado.data);
    } finally {
      BarbeariaApiClient.#requestsEmAndamento.delete(chave);
    }
  }

  /**
   * Mantem um ponto unico de retorno para listas cacheadas.
   * @param {object[]} lista
   * @returns {object[]}
   */
  static #clonarLista(lista) {
    return lista;
  }
}
