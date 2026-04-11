'use strict';

// =============================================================
// MapWidget.js — Mapa interativo Leaflet + FAB de GPS (POO, Singleton)
//
// Responsabilidades:
//   - Inicializar mapa Leaflet (fundo escuro CartoDB) no container indicado
//   - Criar botão flutuante (FAB) centralizado sobre o mapa
//   - Verificar permissão GPS no init:
//       • 'granted'  → carrega posição + marcadores automaticamente
//       • demais     → exibe FAB para solicitar permissão
//   - Ao GPS ativado: centralizar mapa no usuário, exibir marcadores das
//     barbearias próximas e ocultar FAB
//   - onGPSConcedido() / onGPSNegado(): chamados pelo GeoService na boot
//   - Ao ativar GPS pelo FAB, notifica NearbyBarbershopsWidget também
//
// Dependências: Leaflet.js (CDN), GeoService.js, SupabaseService.js
// =============================================================

class MapWidget {

  static #RAIO_KM      = 2;
  static #ZOOM_PADRAO  = 15;   // zoom ao focar no usuário
  static #ZOOM_CIDADE  = 12;   // zoom inicial (sem GPS)
  static #LAT_PADRAO   = -15.7942; // Brasília — fallback visual
  static #LNG_PADRAO   = -47.8825;

  static #mapa            = null;  // instância Leaflet.Map
  static #layerBarbearias = null;  // Leaflet.LayerGroup — marcadores de barbearias
  static #markerUser      = null;  // marcador da posição do usuário
  static #fab             = null;  // elemento do botão flutuante (FAB)
  static #el              = null;  // elemento raiz do container
  static #carregando      = false; // lock para evitar chamadas duplas

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o mapa Leaflet e o FAB no container indicado.
   * Verifica a permissão de GPS e decide o estado inicial.
   * @param {string} containerId — id do elemento HTML raiz
   */
  static async init(containerId) {
    MapWidget.#el = document.getElementById(containerId);
    if (!MapWidget.#el) return;
    if (typeof L === 'undefined') {
      // Leaflet não disponível — mantém placeholder silencioso
      return;
    }

    MapWidget.#inicializarLeaflet();
    MapWidget.#criarFAB();

    const permissao = await GeoService.verificarPermissao();
    if (permissao === 'granted') {
      await MapWidget.#carregar();
    } else {
      MapWidget.#exibirFAB();
    }
  }

  /**
   * Chamado pelo GeoService quando GPS é concedido na primeira abertura
   * (boot silencioso via GeoService.solicitarNaPrimeiraVez).
   */
  static async onGPSConcedido() {
    if (!MapWidget.#mapa) return;
    MapWidget.#ocultarFAB();
    await MapWidget.#carregar();
  }

  /**
   * Chamado pelo GeoService quando GPS é negado na primeira abertura.
   */
  static onGPSNegado() {
    MapWidget.#exibirFAB();
  }

  /**
   * Acionado pelo clique no FAB. Solicita GPS, centraliza mapa e carrega
   * marcadores. Ao concluir, notifica o NearbyBarbershopsWidget (lista).
   */
  static async ativarGPS() {
    if (MapWidget.#carregando) return;
    MapWidget.#setFABCarregando(true);
    try {
      await GeoService.obter(); // solicita permissão + posição
      MapWidget.#ocultarFAB();
      await MapWidget.#carregar();
      // Sincroniza a lista de barbearias abaixo do mapa
      if (typeof NearbyBarbershopsWidget !== 'undefined') {
        NearbyBarbershopsWidget.onGPSConcedido();
      }
    } catch (err) {
      MapWidget.#setFABCarregando(false);
      MapWidget.#exibirFAB(err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Leaflet
  // ═══════════════════════════════════════════════════════════

  /** Cria o mapa Leaflet com tiles claros (CartoDB Positron, gratuito). */
  static #inicializarLeaflet() {
    MapWidget.#mapa = L.map(MapWidget.#el, {
      center:             [MapWidget.#LAT_PADRAO, MapWidget.#LNG_PADRAO],
      zoom:               MapWidget.#ZOOM_CIDADE,
      zoomControl:        false,
      attributionControl: true,
    });

    // Fundo claro — integrado ao tema premium atual do BarberFlow
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
          ' &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom:    19,
      }
    ).addTo(MapWidget.#mapa);

    // Zoom no canto inferior direito
    L.control.zoom({ position: 'bottomright' }).addTo(MapWidget.#mapa);

    // LayerGroup reutilizável para os marcadores das barbearias
    MapWidget.#layerBarbearias = L.layerGroup().addTo(MapWidget.#mapa);
  }

  /** Obtém GPS, centraliza mapa e carrega marcadores de barbearias. */
  static async #carregar() {
    if (MapWidget.#carregando) return;
    MapWidget.#carregando = true;
    try {
      const pos   = await GeoService.obter();
      MapWidget.#centralizarUsuario(pos.lat, pos.lng);
      const lista = await MapWidget.#buscarBarbearias(pos.lat, pos.lng);
      MapWidget.#renderMarcadores(lista);
    } catch (_) {
      // silencioso — GPS negado após concessão anterior (raro)
    } finally {
      MapWidget.#carregando = false;
    }
  }

  /** Busca barbearias próximas via Supabase Edge Function. */
  static async #buscarBarbearias(lat, lng) {
    try {
      const { data, error } = await SupabaseService.client.functions.invoke(
        'nearby-barbershops',
        { body: { latitude: lat, longitude: lng, radius_km: MapWidget.#RAIO_KM } }
      );
      if (error) return [];
      // Edge Function retorna { data: [...], total: n }
      return (data?.data ?? data) ?? [];
    } catch {
      return [];
    }
  }

  /** Centraliza o mapa na posição do usuário e adiciona marcador pulsante. */
  static #centralizarUsuario(lat, lng) {
    if (!MapWidget.#mapa) return;

    MapWidget.#mapa.flyTo([lat, lng], MapWidget.#ZOOM_PADRAO, {
      animate:  true,
      duration: 1.2,
    });

    if (MapWidget.#markerUser) MapWidget.#markerUser.remove();

    const icon = L.divIcon({
      className: '',
      html: `<div class="mapa-marker-user">
               <div class="mapa-marker-user-pulse"></div>
               <div class="mapa-marker-user-dot"></div>
             </div>`,
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
    });

    MapWidget.#markerUser = L.marker([lat, lng], { icon })
      .addTo(MapWidget.#mapa)
      .bindPopup('<strong style="color:#D4AF37">Você está aqui</strong>');
  }

  /** Adiciona um marcador avatar no mapa para cada barbearia da lista. */
  static #renderMarcadores(lista) {
    if (!MapWidget.#layerBarbearias) return;
    MapWidget.#layerBarbearias.clearLayers();

    lista.forEach(b => {
      if (!b.latitude || !b.longitude) return;

      const avatarUrl  = MapWidget.#urlAvatar(b.logo_path);
      const iniciais   = MapWidget.#iniciaisNome(b.name);
      const distTexto  = b.distance_km != null
        ? b.distance_km < 1
          ? `${(b.distance_km * 1000).toFixed(0)} m`
          : `${b.distance_km.toFixed(1)} km`
        : null;

      // ── Ícone: avatar circular + pin dourado ──
      const imgTag = avatarUrl
        ? `<img src="${avatarUrl}"
                class="mapa-av__img"
                alt="${iniciais}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const initialsStyle = avatarUrl ? 'display:none' : 'display:flex';

      const icon = L.divIcon({
        className:   '',
        html: `<div class="mapa-av">
                 <div class="mapa-av__ring">
                   ${imgTag}
                   <span class="mapa-av__initials" style="${initialsStyle}">${iniciais}</span>
                 </div>
                 <div class="mapa-av__pin"></div>
               </div>`,
        iconSize:    [48, 58],
        iconAnchor:  [24, 58],
        popupAnchor: [0, -62],
      });

      // ── Popup rico: avatar grande + info ──
      const popupImgTag = avatarUrl
        ? `<img src="${avatarUrl}"
                class="mapa-popup__avatar-img"
                alt="${iniciais}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const popupInitialsStyle = avatarUrl ? 'display:none' : 'display:flex';

      const statusHtml = b.is_open
        ? `<span class="mapa-popup__badge mapa-popup__badge--open">Aberta</span>`
        : `<span class="mapa-popup__badge mapa-popup__badge--closed">Fechada</span>`;
      const ratingHtml = b.rating_count > 0
        ? `<span class="mapa-popup__rating">⭐ ${Number(b.rating_avg).toFixed(1)}<small>(${b.rating_count})</small></span>`
        : '';
      const distHtml = distTexto
        ? `<span class="mapa-popup__dist">📍 ${distTexto} de você</span>`
        : '';

      const popup = `<div class="mapa-popup">
        <div class="mapa-popup__avatar">
          ${popupImgTag}
          <span class="mapa-popup__avatar-initials" style="${popupInitialsStyle}">${iniciais}</span>
        </div>
        <div class="mapa-popup__info">
          <strong class="mapa-popup__nome">${b.name ?? 'Barbearia'}</strong>
          <div class="mapa-popup__meta">
            ${statusHtml}${ratingHtml}
          </div>
          ${b.address ? `<span class="mapa-popup__addr">${b.address}${b.city ? ', ' + b.city : ''}</span>` : ''}
          ${distHtml}
        </div>
      </div>`;

      L.marker([b.latitude, b.longitude], { icon })
        .addTo(MapWidget.#layerBarbearias)
        .bindPopup(popup, { maxWidth: 260, minWidth: 220 })
        .bindTooltip(b.name ?? 'Barbearia', {
          permanent:  true,
          direction:  'bottom',
          offset:     [0, 6],
          className:  'mapa-tooltip-nome',
        });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Helpers de avatar
  // ═══════════════════════════════════════════════════════════

  /**
   * Converte logo_path (Supabase Storage) em URL pública.
   * Retorna null se o path estiver ausente.
   * @param {string|null} logoPath
   * @returns {string|null}
   */
  static #urlAvatar(logoPath) {
    if (!logoPath) return null;
    try {
      const { data } = SupabaseService.client.storage
        .from('barbershops')
        .getPublicUrl(logoPath);
      return data?.publicUrl ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Extrai até 2 iniciais do nome da barbearia como fallback visual.
   * @param {string} nome
   * @returns {string}
   */
  static #iniciaisNome(nome) {
    if (!nome) return '✂';
    const palavras = nome.trim().split(/\s+/).filter(Boolean);
    if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
    return (palavras[0][0] + palavras[1][0]).toUpperCase();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — FAB (Floating Action Button)
  // ═══════════════════════════════════════════════════════════

  /** Cria o FAB e o injeta no container do mapa (posição absoluta). */
  static #criarFAB() {
    const fab = document.createElement('button');
    fab.id        = 'mapa-gps-fab';
    fab.className = 'mapa-gps-fab';
    fab.setAttribute('aria-label', 'Ativar GPS para ver barbearias próximas');
    fab.innerHTML = `<span class="mapa-gps-fab-icon">📍</span>
                     <span class="mapa-gps-fab-label">Ativar GPS</span>`;
    fab.style.display = 'none'; // oculto até o check de permissão
    fab.addEventListener('click', () => MapWidget.ativarGPS());

    MapWidget.#el.appendChild(fab);
    MapWidget.#fab = fab;
  }

  static #ocultarFAB() {
    if (!MapWidget.#fab) return;
    MapWidget.#fab.classList.add('mapa-gps-fab--oculto');
    // Remove do fluxo após animação de saída
    setTimeout(() => {
      if (MapWidget.#fab) MapWidget.#fab.style.display = 'none';
    }, 350);
  }

  static #exibirFAB(erro = null) {
    if (!MapWidget.#fab) return;
    MapWidget.#fab.style.display  = '';
    MapWidget.#fab.disabled       = false;
    MapWidget.#fab.classList.remove('mapa-gps-fab--oculto', 'mapa-gps-fab--carregando');

    const label = MapWidget.#fab.querySelector('.mapa-gps-fab-label');
    const icone = MapWidget.#fab.querySelector('.mapa-gps-fab-icon');

    if (erro) {
      if (label) label.textContent = 'Tentar novamente';
      if (icone) icone.textContent = '⚠️';
      MapWidget.#fab.classList.add('mapa-gps-fab--erro');
    } else {
      if (label) label.textContent = 'Ativar GPS';
      if (icone) icone.textContent = '📍';
      MapWidget.#fab.classList.remove('mapa-gps-fab--erro');
    }
  }

  static #setFABCarregando(ativo) {
    if (!MapWidget.#fab) return;
    const label = MapWidget.#fab.querySelector('.mapa-gps-fab-label');
    const icone = MapWidget.#fab.querySelector('.mapa-gps-fab-icon');
    if (ativo) {
      MapWidget.#fab.classList.add('mapa-gps-fab--carregando');
      MapWidget.#fab.disabled = true;
      if (label) label.textContent = 'Localizando…';
      if (icone) icone.textContent = '⏳';
    } else {
      MapWidget.#fab.classList.remove('mapa-gps-fab--carregando');
      MapWidget.#fab.disabled = false;
    }
  }
}
