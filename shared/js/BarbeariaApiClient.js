'use strict';

// =============================================================
// BarbeariaApiClient.js — Fachada de acesso a dados de barbearias.
//
// Responsabilidades:
//   - Chamar a BFF (BffApiService) como fonte primária
//   - Em caso de falha da BFF, usar fallback para Supabase direto
//     via BarbershopRepository (zero regressão)
//   - Guards obrigatórios: previne lat/lng undefined antes da chamada
//   - Logs de diagnóstico quando o fallback é ativado
//
// Consumidores: NearbyBarbershopsWidget
// Dependências: BffApiService.js, BarbershopRepository.js, LoggerService.js
// =============================================================

class BarbeariaApiClient {

  static #RAIO_PADRAO_KM  = 5;
  static #LIMIT_DESTAQUE  = 6;
  static #LIMIT_TODAS     = 60;

  // ── API pública ──────────────────────────────────────────────────

  /**
   * Lista barbearias próximas à coordenada informada.
   * Fallback para BarbershopRepository.getNearby() se BFF falhar.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} [raioKm=5]
   * @returns {Promise<object[]>}
   */
  static async getNearby(lat, lng, raioKm = BarbeariaApiClient.#RAIO_PADRAO_KM) {
    BarbeariaApiClient.#validarCoordenadas(lat, lng);

    const { data, error } = await BffApiService.get('/api/v1/barbearias', {
      lat,
      lng,
      raio: raioKm,
    });

    if (!error && Array.isArray(data)) return data;

    LoggerService.warn(
      '[BarbeariaApiClient] getNearby: BFF falhou, usando fallback Supabase.',
      error?.message,
    );

    return BarbershopRepository.getNearby(lat, lng, raioKm).catch(() => []);
  }

  /**
   * Lista barbearias em destaque (top rated).
   * Fallback para BarbershopRepository.getFeatured() se BFF falhar.
   *
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  static async getDestaque(limit = BarbeariaApiClient.#LIMIT_DESTAQUE) {
    const { data, error } = await BffApiService.get('/api/v1/barbearias/destaque', {
      limit,
    });

    if (!error && Array.isArray(data)) return data;

    LoggerService.warn(
      '[BarbeariaApiClient] getDestaque: BFF falhou, usando fallback Supabase.',
      error?.message,
    );

    return BarbershopRepository.getFeatured(limit).catch(() => []);
  }

  /**
   * Lista todas as barbearias ativas por popularidade.
   * Fallback para BarboshopRepository.getAllByCortes() se BFF falhar.
   *
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  static async getTodas(limit = BarbeariaApiClient.#LIMIT_TODAS) {
    const { data, error } = await BffApiService.get('/api/v1/barbearias/todas', {
      limit,
    });

    if (!error && Array.isArray(data)) return data;

    LoggerService.warn(
      '[BarbeariaApiClient] getTodas: BFF falhou, usando fallback Supabase.',
      error?.message,
    );

    return BarbershopRepository.getAllByCortes(limit).catch(() => []);
  }

  // ── Privados ─────────────────────────────────────────────────────

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
}
