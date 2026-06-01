'use strict';

// =============================================================
// GpsPanelMap.js — Mini-mapa do sub-painel GPS (Minha Barbearia)
//
// Responsabilidades:
//  • Renderizar mapa Leaflet no container #gps-mapa-todas.
//  • Exibir APENAS o marcador da própria barbearia (destaque).
//  • NÃO busca outras barbearias — sem chamadas ao BFF.
//
// Dependências: Leaflet.js (CDN)
// =============================================================

class GpsPanelMap {

  static #ZOOM_DESTAQUE = 14;
  static #ZOOM_GERAL    = 12;
  static #LAT_PADRAO    = -15.7942; // Brasília — fallback visual
  static #LNG_PADRAO    = -47.8825;

  static #mapa        = null;  // instância Leaflet.Map
  static #destaqueMkr = null;  // marcador da própria barbearia

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o mapa Leaflet no container indicado.
   * Idempotente: chamadas subsequentes são ignoradas.
   * @param {string} containerId — id do elemento HTML raiz
   */
  static init(containerId) {
    if (GpsPanelMap.#mapa) return;
    const el = document.getElementById(containerId);
    if (!el || typeof L === 'undefined') return;

    GpsPanelMap.#mapa = L.map(el, {
      center:             [GpsPanelMap.#LAT_PADRAO, GpsPanelMap.#LNG_PADRAO],
      zoom:               GpsPanelMap.#ZOOM_GERAL,
      zoomControl:        true,
      attributionControl: true,
    });

    const tiles = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(GpsPanelMap.#mapa);

    // Filtro escuro — mantém tema do BarberFlow
    tiles.on('add', () => {
      const c = tiles.getContainer ? tiles.getContainer() : null;
      if (c) c.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)';
    });

    // Garante dimensões corretas após o primeiro ciclo de CSS
    setTimeout(() => GpsPanelMap.#mapa?.invalidateSize(), 0);
  }

  /**
   * Força o Leaflet a recalcular o tamanho do container.
   * Deve ser chamado sempre que o painel GPS se torna visível.
   */
  static redimensionar() {
    if (!GpsPanelMap.#mapa) return;
    requestAnimationFrame(() => GpsPanelMap.#mapa.invalidateSize());
  }

  /**
   * Posiciona o marcador da própria barbearia no mapa.
   * Síncrono — zero requests HTTP.
   *
   * @param {number|null} destaqueLat  — latitude da barbearia
   * @param {number|null} destaqueLng  — longitude da barbearia
   * @param {string|null} nomeDestaque — nome da barbearia
   */
  static carregar(destaqueLat = null, destaqueLng = null, nomeDestaque = null) {
    if (!GpsPanelMap.#mapa) return;
    GpsPanelMap.#renderDestaque(destaqueLat, destaqueLng, nomeDestaque);
    GpsPanelMap.#ajustarBounds(destaqueLat, destaqueLng);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /** Cria / atualiza o marcador destacado para a barbearia atual. */
  static #renderDestaque(lat, lng, nome) {
    GpsPanelMap.#destaqueMkr?.remove();
    GpsPanelMap.#destaqueMkr = null;

    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!isFinite(nLat) || !isFinite(nLng)) return;

    const label = nome ?? 'Sua Barbearia';
    GpsPanelMap.#destaqueMkr = L.marker([nLat, nLng], { icon: GpsPanelMap.#iconeDestaque() })
      .bindPopup(`<strong style="color:#D4AF37">📍 ${label}</strong>`)
      .addTo(GpsPanelMap.#mapa)
      .openPopup();
  }

  /** Centraliza o mapa na barbearia; usa fallback padrão se sem coordenadas. */
  static #ajustarBounds(lat, lng) {
    if (!GpsPanelMap.#mapa) return;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (isFinite(nLat) && isFinite(nLng)) {
      GpsPanelMap.#mapa.setView([nLat, nLng], GpsPanelMap.#ZOOM_DESTAQUE);
    }
  }

  /** L.divIcon destacado — pin pulsante para a barbearia atual. */
  static #iconeDestaque() {
    return L.divIcon({
      className:  '',
      html:       '<div class="gps-mapa-pin gps-mapa-pin--destaque"></div>',
      iconSize:   [26, 26],
      iconAnchor: [13, 13],
    });
  }
}
