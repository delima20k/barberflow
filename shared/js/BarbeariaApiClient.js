'use strict';

// =============================================================
// BarbeariaApiClient.js — Fachada de acesso a dados de barbearias.
//
// Responsabilidades:
//   - Chamar a BFF (BffApiService) como fonte primária
//   - Se BFF indisponível: retornar [] para que o widget exiba estado vazio
//   - Guards obrigatórios: previne lat/lng inválidos antes da chamada
//
// Consumidores: NearbyBarbershopsWidget
// Dependências: BffApiService.js, LoggerService.js
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

  // ── API pública ──────────────────────────────────────────────────

  /**
   * Lista barbearias próximas à coordenada informada.
   * BFF indisponível → retorna [] para que o widget exiba estado vazio.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} [raioKm=5]
   * @returns {Promise<object[]>}
   */
  static async getNearby(lat, lng, raioKm = BarbeariaApiClient.#RAIO_PADRAO_KM) {
    BarbeariaApiClient.#validarCoordenadas(lat, lng);

    const chave = [
      'nearby',
      Number(lat).toFixed(3),
      Number(lng).toFixed(3),
      Number(raioKm),
    ].join(':');

    return BarbeariaApiClient.#comCache(chave, async () => {
      const { data, error } = await BffApiService.get('/api/v1/barbearias', {
        lat,
        lng,
        raio: raioKm,
      });

      if (!error && Array.isArray(data)) return { data, cachear: true };

      BarbeariaApiClient.#logAviso('getNearby', error?.message);
      return { data: [], cachear: false };
    });
  }

  /**
   * Lista barbearias em destaque (top rated).
   * BFF indisponível → retorna [] para que o widget exiba estado vazio.
   *
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  static async getDestaque(limit = BarbeariaApiClient.#LIMIT_DESTAQUE) {
    const chave = `destaque:${Number(limit)}`;

    return BarbeariaApiClient.#comCache(chave, async () => {
      const { data, error } = await BffApiService.get('/api/v1/barbearias/destaque', {
        limit,
      });

      if (!error && Array.isArray(data)) return { data, cachear: true };

      BarbeariaApiClient.#logAviso('getDestaque', error?.message);
      return { data: [], cachear: false };
    });
  }

  /**
   * Lista todas as barbearias ativas por popularidade.
   * BFF indisponível → retorna [] para que o widget exiba estado vazio.
   *
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  static async getTodas(limit = BarbeariaApiClient.#LIMIT_TODAS) {
    const chave = `todas:${Number(limit)}`;

    return BarbeariaApiClient.#comCache(chave, async () => {
      const { data, error } = await BffApiService.get('/api/v1/barbearias/todas', {
        limit,
      });

      if (!error && Array.isArray(data)) return { data, cachear: true };

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
