'use strict';

// =============================================================
// BarbershopService.js — Serviço de negócio para barbearias.
// Aplica regras de negócio (proximidade, ordenação, like) sobre
// os dados retornados pelo BarbershopRepository.
// Nunca acessa Supabase diretamente — delega ao repositório.
//
// Dependências: BarbershopRepository.js, GeoService.js
// =============================================================

// Camada de serviço — contém regras de negócio para barbearias.
class BarbershopService {

  // ═══════════════════════════════════════════════════════════
  // UTILITÁRIOS PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Calcula distância haversine em km entre dois pontos geográficos.
   * @private
   */
  static #haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, d = Math.PI / 180;
    const dLat = (lat2 - lat1) * d;
    const dLon = (lon2 - lon1) * d;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Enriquece uma lista de barbearias com `distance_km` e ordena por proximidade.
   * Silencioso se GPS não disponível — retorna lista na ordem original.
   * @param {object[]} lista
   * @returns {Promise<object[]>}
   * @private
   */
  static async #enriquecerComGeo(lista) {
    try {
      const perm = await GeoService.verificarPermissao();
      if (perm !== 'granted') return lista;

      const pos = await GeoService.obter();
      return lista
        .map(b => ({
          ...b,
          distance_km: b.latitude
            ? parseFloat(BarbershopService.#haversine(pos.lat, pos.lng, b.latitude, b.longitude).toFixed(1))
            : null,
        }))
        .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    } catch (_) {
      return lista; // GPS falhou — retorna sem enriquecimento
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Carrega todos os dados necessários para a tela inicial.
   * Retorna um objeto com cards, destaque e barbeiros.
   * As requisições são paralelas para máxima performance.
   * @returns {Promise<{cards: object[], destaque: object[], barbeiros: object[]}>}
   */
  static async loadHome() {
    const [rawCards, destaque, barbeiros] = await Promise.allSettled([
      BarbershopRepository.getAll(10),
      BarbershopRepository.getFeatured(6),
      BarbershopRepository.getBarbers(10),
    ]);

    const cards = rawCards.status === 'fulfilled'
      ? await BarbershopService.#enriquecerComGeo(rawCards.value)
      : [];

    return {
      cards,
      destaque:  destaque.status  === 'fulfilled' ? destaque.value  : [],
      barbeiros: barbeiros.status === 'fulfilled' ? barbeiros.value : [],
    };
  }

  /**
   * Busca barbearias próximas ao usuário dentro do raio especificado.
   * Requer GPS concedido — retorna [] se não disponível.
   * @param {number} radiusKm
   * @returns {Promise<object[]>}
   */
  static async loadNearby(radiusKm = 3) {
    const perm = await GeoService.verificarPermissao();
    if (perm !== 'granted') return [];

    const pos  = await GeoService.obter();
    const data = await BarbershopRepository.getNearby(pos.lat, pos.lng, radiusKm);

    return data
      .map(b => ({
        ...b,
        distance_km: parseFloat(
          BarbershopService.#haversine(pos.lat, pos.lng, b.latitude, b.longitude).toFixed(2)
        ),
      }))
      .filter(b => b.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  /**
   * Busca textual enriquecida com geolocalização.
   * @param {string} query
   * @returns {Promise<object[]>}
   */
  static async search(query) {
    const data = await BarbershopRepository.search(query);
    return BarbershopService.#enriquecerComGeo(data);
  }

  /**
   * Toggle de like otimista — atualiza a UI imediatamente.
   * (Persistência real via tabela story_likes deve ser implementada em seguida.)
   * @param {HTMLElement} btn — botão .story-like-btn
   */
  static toggleLike(btn) {
    btn.classList.toggle('curtido');
    const span = btn.querySelector('.story-like-count');
    if (!span) return;
    const n = parseInt(span.textContent) || 0;
    span.textContent = btn.classList.contains('curtido') ? n + 1 : n - 1;
  }
}
