'use strict';

// =============================================================
// GpsPanelMap.js — Mini-mapa do sub-painel GPS (Minha Barbearia)
//
// Responsabilidades:
//  • Renderizar mapa Leaflet no container #gps-mapa-todas.
//  • Listar TODAS as barbearias cadastradas com endereço e coordenadas.
//  • Destacar a barbearia atual quando ela já tem localização salva.
//  • Atualizar após o save de um novo endereço.
//
// Dependências: Leaflet.js (CDN), BarbeariaApiClient.js
// =============================================================

class GpsPanelMap {

  static #ZOOM_DESTAQUE = 14;
  static #ZOOM_GERAL    = 12;
  static #LAT_PADRAO    = -15.7942; // Brasília — fallback visual
  static #LNG_PADRAO    = -47.8825;

  static #mapa        = null;  // instância Leaflet.Map
  static #layer       = null;  // LayerGroup dos pins de barbearias
  static #destaqueMkr = null;  // marcador destacado (barbearia atual)
  static #carregando  = false;

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

    GpsPanelMap.#layer = L.layerGroup().addTo(GpsPanelMap.#mapa);

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
   * Busca todas as barbearias cadastradas com coordenadas e renderiza pins.
   * Se destaqueLat/destaqueLng forem informados, destaca essa barbearia.
   *
   * @param {number|null} destaqueLat  — latitude da barbearia atual
   * @param {number|null} destaqueLng  — longitude da barbearia atual
   * @param {string|null} nomeDestaque — nome da barbearia atual
   */
  static async carregar(destaqueLat = null, destaqueLng = null, nomeDestaque = null) {
    if (!GpsPanelMap.#mapa || GpsPanelMap.#carregando) return;
    GpsPanelMap.#carregando = true;
    try {
      const lista = await GpsPanelMap.#fetchTodas();
      GpsPanelMap.#renderPins(lista);
      GpsPanelMap.#renderDestaque(destaqueLat, destaqueLng, nomeDestaque);
      GpsPanelMap.#ajustarBounds(lista, destaqueLat, destaqueLng);
    } finally {
      GpsPanelMap.#carregando = false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /** Busca todas as barbearias com endereço e coordenadas via BarbeariaApiClient. */
  static async #fetchTodas() {
    try {
      const lista = await BarbeariaApiClient.getTodas(200);
      return (lista ?? [])
        .map(s => ({ ...s, latitude: Number(s.latitude), longitude: Number(s.longitude) }))
        .filter(s => isFinite(s.latitude) && isFinite(s.longitude) && s.address);
    } catch {
      return [];
    }
  }

  /** Renderiza pins de todas as barbearias na layer. */
  static #renderPins(lista) {
    GpsPanelMap.#layer?.clearLayers();
    for (const s of lista) {
      const nome    = s.name ?? s.trade_name ?? 'Barbearia';
      const endereco = s.address ?? '';
      const popup   = `<strong style="color:#D4AF37">${nome}</strong>`
                    + (endereco ? `<br><small>${endereco}</small>` : '');
      L.marker([s.latitude, s.longitude], { icon: GpsPanelMap.#iconePadrao() })
        .bindPopup(popup)
        .addTo(GpsPanelMap.#layer);
    }
  }

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

  /**
   * Ajusta o viewport:
   * — com destaque → centraliza na barbearia atual;
   * — sem destaque → fitBounds em todos os pins.
   */
  static #ajustarBounds(lista, destaqueLat, destaqueLng) {
    if (!GpsPanelMap.#mapa || typeof L === 'undefined') return;

    const nLat = Number(destaqueLat);
    const nLng = Number(destaqueLng);
    if (isFinite(nLat) && isFinite(nLng)) {
      GpsPanelMap.#mapa.setView([nLat, nLng], GpsPanelMap.#ZOOM_DESTAQUE);
      return;
    }

    const pontos = lista.map(s => [s.latitude, s.longitude]);
    if (!pontos.length) return;
    if (pontos.length === 1) {
      GpsPanelMap.#mapa.setView(pontos[0], GpsPanelMap.#ZOOM_DESTAQUE);
      return;
    }
    GpsPanelMap.#mapa.fitBounds(L.latLngBounds(pontos), { padding: [24, 24], maxZoom: 14 });
  }

  /** L.divIcon padrão — pin dourado para barbearias cadastradas. */
  static #iconePadrao() {
    return L.divIcon({
      className:  '',
      html:       '<div class="gps-mapa-pin"></div>',
      iconSize:   [18, 18],
      iconAnchor: [9, 9],
    });
  }

  /** L.divIcon destacado — pin vermelho pulsante para a barbearia atual. */
  static #iconeDestaque() {
    return L.divIcon({
      className:  '',
      html:       '<div class="gps-mapa-pin gps-mapa-pin--destaque"></div>',
      iconSize:   [26, 26],
      iconAnchor: [13, 13],
    });
  }
}
