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

  static #RAIO_KM      = 5;
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
  static #posUsuario      = null;  // última posição válida do usuário
  static #headingAccum    = null;  // ângulo acumulado (evita giro de 360° na borda 0/360)

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

    // Escuta eventos de GPS do GeoService — sem dependência direta
    document.addEventListener('geo:concedido', () => MapWidget.onGPSConcedido(), { once: false });
    document.addEventListener('geo:negado',    () => MapWidget.onGPSNegado(),    { once: false });

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
   * Força o Leaflet a recalcular o tamanho do container.
   * Deve ser chamado sempre que o painel do mapa é exibido após ficar oculto.
   */
  static redimensionar() {
    if (!MapWidget.#mapa) return;
    requestAnimationFrame(() => MapWidget.#mapa.invalidateSize());
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

  /** Cria o mapa Leaflet com tiles OpenStreetMap + filtro dark (100% gratuito, sem API key). */
  static #inicializarLeaflet() {
    MapWidget.#mapa = L.map(MapWidget.#el, {
      center:             [MapWidget.#LAT_PADRAO, MapWidget.#LNG_PADRAO],
      zoom:               MapWidget.#ZOOM_CIDADE,
      zoomControl:        false,
      attributionControl: true,
    });

    // OpenStreetMap — gratuito para sempre, sem chave de API, open-source
    // Filtro CSS inverte as cores para manter tema escuro do BarberFlow
    const tiles = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(MapWidget.#mapa);

    tiles.on('add', () => {
      const c = tiles.getContainer ? tiles.getContainer() : null;
      if (c) c.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)';
    });

    // Zoom no canto inferior direito
    L.control.zoom({ position: 'bottomright' }).addTo(MapWidget.#mapa);

    // LayerGroup reutilizável para os marcadores das barbearias
    MapWidget.#layerBarbearias = L.layerGroup().addTo(MapWidget.#mapa);

    // Garante que o Leaflet conhece as dimensões reais do container
    // após o primeiro ciclo de renderização do CSS.
    setTimeout(() => MapWidget.#mapa?.invalidateSize(), 0);
  }

  /** Obtém GPS, centraliza mapa e carrega marcadores de barbearias. */
  static async #carregar() {
    if (MapWidget.#carregando) return;
    MapWidget.#carregando = true;
    try {
      const pos   = await GeoService.obter();
      if (!pos || !isFinite(pos.lat) || !isFinite(pos.lng)) return;
      MapWidget.#centralizarUsuario(pos.lat, pos.lng);
      const lista = await MapWidget.#buscarBarbearias(pos.lat, pos.lng);
      MapWidget.#renderMarcadores(lista);
      // Inicia rastreamento contínuo — move o marcador do usuário em tempo real
      GeoService.iniciarWatch((lat, lng) => MapWidget.atualizarPosicaoUsuario(lat, lng));
    } catch (_) {
      // silencioso — GPS negado após concessão anterior (raro)
    } finally {
      MapWidget.#carregando = false;
    }
  }

  /** Busca barbearias pr\u00f3ximas diretamente no banco Supabase. */
  static async #buscarBarbearias(lat, lng) {
    try {
      const R    = MapWidget.#RAIO_KM;
      const latD = R / 111.0;
      const lonD = R / (111.0 * Math.cos(lat * Math.PI / 180));

      const { data, error } = await SupabaseService.barbershops()
        .select('id, name, slug, address, city, latitude, longitude, logo_path, is_open, rating_avg, rating_count')
        .eq('is_active', true)
        .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
        .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
        .limit(200);

      if (error) return [];

      return (data ?? [])
        .map(s => ({
          ...s,
          distance_km: parseFloat(MapWidget.#haversine(lat, lng, s.latitude, s.longitude).toFixed(2)),
        }))
        .filter(s => s.distance_km <= R)
        .sort((a, b) => a.distance_km - b.distance_km);
    } catch {
      return [];
    }
  }

  static #haversine(lat1, lon1, lat2, lon2) {
    const Rt = 6371, d = Math.PI / 180;
    const dLat = (lat2 - lat1) * d, dLon = (lon2 - lon1) * d;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
    return Rt * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Centraliza o mapa na posição do usuário e cria/atualiza o marcador com avatar. */
  static #centralizarUsuario(lat, lng) {
    if (!MapWidget.#mapa) return;
    if (!isFinite(lat) || !isFinite(lng)) return;

    MapWidget.#posUsuario = { lat, lng };

    // Para qualquer animação em andamento e força recalculo das dimensões.
    // Sem isso, Leaflet faz unproject com container size = 0 → NaN por frame.
    MapWidget.#mapa.stop();
    MapWidget.#mapa.invalidateSize();

    const container = MapWidget.#mapa.getContainer();
    const animar    = !!(container?.clientWidth && container?.clientHeight);

    MapWidget.#mapa.flyTo([lat, lng], MapWidget.#ZOOM_PADRAO, {
      animate:  animar,
      duration: animar ? 1.2 : 0,
    });

    if (MapWidget.#markerUser) MapWidget.#markerUser.remove();

    MapWidget.#markerUser = L.marker([lat, lng], { icon: MapWidget.#criarIconeUsuario() })
      .addTo(MapWidget.#mapa)
      .bindPopup('<strong style="color:#D4AF37">Você está aqui</strong>');
  }

  /** Constrói o L.divIcon do marcador do usuário com o avatar atual em cache. */
  static #criarIconeUsuario() {
    const avatarUrl = (typeof SessionCache !== 'undefined')
      ? SessionCache.getAvatar()
      : null;

    if (avatarUrl) {
      return L.divIcon({
        className: '',
        html: `<div class="mapa-marker-user mapa-marker-user--avatar">
                 <div class="mapa-marker-user-pulse"></div>
                 <img src="${avatarUrl}"
                      class="mapa-marker-user-img"
                      alt="Você"
                      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                 <div class="mapa-marker-user-dot" style="display:none"></div>
               </div>`,
        iconSize:   [40, 40],
        iconAnchor: [20, 20],
      });
    }

    return L.divIcon({
      className: '',
      html: `<div class="mapa-marker-user">
               <div class="mapa-marker-user-pulse"></div>
               <div class="mapa-marker-user-dot"></div>
             </div>`,
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
    });
  }

  /**
   * Atualiza o ícone do marcador do usuário com o avatar atual do cache.
   * Chamado pelo AuthService após login, logout ou troca de avatar.
   */
  static atualizarMarcadorUsuario() {
    if (!MapWidget.#markerUser || !MapWidget.#posUsuario) return;
    MapWidget.#markerUser.setIcon(MapWidget.#criarIconeUsuario());
  }

  /**
   * Move o marcador do usuário em tempo real sem reanimar o mapa.
   * Chamado pelo GeoService via watchPosition a cada nova leitura GPS.
   * O DOM do marcador é preservado — o cone de heading não é perdido.
   * @param {number} lat
   * @param {number} lng
   */
  static atualizarPosicaoUsuario(lat, lng) {
    if (!MapWidget.#markerUser || !MapWidget.#mapa) return;
    if (!isFinite(lat) || !isFinite(lng)) return;
    MapWidget.#posUsuario = { lat, lng };
    MapWidget.#markerUser.setLatLng([lat, lng]);
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
      return SupabaseService.getLogoUrl(logoPath) ?? null;
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
    if (!nome) return '💈';
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

  // ═══════════════════════════════════════════════════════════
  // EXPOSTOS para MapOrientationModule
  // ═══════════════════════════════════════════════════════════

  /** Expõe a instância Leaflet Map para módulos externos. */
  static getMap() {
    return MapWidget.#mapa;
  }

  /**
   * Gira a seta de direção no marcador do usuário conforme o heading.
   * O mapa permanece fixo (Norte = cima). Apenas a seta roda.
   * @param {number} heading — graus 0-360 (0 = Norte, sentido horário)
   */
  static setUserHeading(heading) {
    if (!MapWidget.#markerUser) return;
    const el = MapWidget.#markerUser.getElement();
    if (!el) return;
    const inner = el.querySelector('.mapa-marker-user');
    if (!inner) return;

    // Cria o cone de rotação apenas uma vez por marcador
    let cone = inner.querySelector('.mapa-heading-cone');
    const primeiraVez = !cone;
    if (primeiraVez) {
      cone = document.createElement('div');
      cone.className = 'mapa-heading-cone';
      const arrowEl = document.createElement('div');
      arrowEl.className = 'mapa-heading-arrow';
      cone.appendChild(arrowEl);
      inner.appendChild(cone);
    }

    // ── Interpolação de caminho mínimo ─────────────────────────
    // Resolver o problema: 350° → 10° deve girar +20°, não -340°.
    // Acumulamos o ângulo real em vez de forçar o valor para 0-360.
    if (MapWidget.#headingAccum === null) {
      // 1ª ativação da bússola — posiciona sem transição para evitar voo inicial
      cone.style.transition = 'none';
      MapWidget.#headingAccum = heading;
    } else if (primeiraVez) {
      // Marcador foi recriado (atualização de posição) mas bússola ainda ativa.
      // Re-aplica o ângulo acumulado sem transição e SEM resetar #headingAccum.
      cone.style.transition = 'none';
    } else {
      // Update normal — calcula o delta pelo caminho mais curto (-180 a +180)
      let delta = heading - (MapWidget.#headingAccum % 360);
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      MapWidget.#headingAccum += delta;
      cone.style.transition = 'opacity 300ms ease, transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    }

    cone.style.transform = `rotate(${MapWidget.#headingAccum}deg)`;
    cone.style.opacity   = '1';
  }

  /**
   * Oculta a seta de heading no marcador do usuário.
   * Chamado ao desativar a bússola.
   */
  static clearUserHeading() {
    if (!MapWidget.#markerUser) return;
    const el = MapWidget.#markerUser.getElement();
    if (!el) return;
    const cone = el.querySelector('.mapa-heading-cone');
    if (cone) cone.style.opacity = '0';
    MapWidget.#headingAccum = null; // reset para próxima ativação
  }
}
