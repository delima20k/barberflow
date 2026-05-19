'use strict';

// =============================================================
// GpsBarbeariaMarker.js — Marcador Leaflet premium para barbearias
//
// Responsabilidades:
//   - Criar L.Marker com ícone casinha 3D (logo + fallback iniciais)
//   - Renderizar popup rico com nome, endereço, status, rating,
//     distância e botão "Ver Barbearia"
//   - Despachar CustomEvent('mapa:ver-barbearia') ao clicar no botão
//   - Encapsular todos os helpers de HTML/avatar/escaping
//
// Dependências: Leaflet.js (CDN), ApiService.js
// Consumidores: MapWidget.js
// =============================================================

class GpsBarbeariaMarker {

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Cria um L.Marker premium para a barbearia informada.
   *
   * @param {object} barbearia  — objeto retornado pela BFF
   * @param {object} [opcoes]
   * @param {{ lat: number, lng: number }|null} [opcoes.posUsuario] — posição do usuário p/ distância
   * @returns {L.Marker|null}   — null se coordenadas inválidas ou Leaflet indisponível
   */
  static criar(barbearia, opcoes = {}) {
    if (typeof L === 'undefined') return null;

    const coords = GpsBarbeariaMarker.#normalizarCoords(barbearia);
    if (!coords) return null;

    const distTexto = GpsBarbeariaMarker.#calcularDistancia(barbearia, opcoes.posUsuario ?? null);
    const icon      = GpsBarbeariaMarker.#icone(barbearia);
    const popup     = GpsBarbeariaMarker.#popup(barbearia, distTexto);
    const nomeSeguro       = GpsBarbeariaMarker.#escapeHtml(barbearia.name ?? 'Barbearia');
    const numeroEndSeguro  = GpsBarbeariaMarker.#escapeHtml(
      GpsBarbeariaMarker.#numeroEndereco(barbearia.address)
    );

    const marker = L.marker([coords.lat, coords.lng], { icon })
      .bindPopup(popup, { maxWidth: 260, minWidth: 220 })
      .bindTooltip(
        `${nomeSeguro}${numeroEndSeguro ? ` — N&ordm;&nbsp;${numeroEndSeguro}` : ''}`,
        { permanent: false, direction: 'bottom', offset: [0, 27], className: 'mapa-tooltip-nome' }
      );

    marker.on('popupopen', () => {
      const btn = marker.getPopup()?.getElement()
                    ?.querySelector('.gps-marker-popup__btn-ver');
      if (!btn) return;
      btn.onclick = () => {
        document.dispatchEvent(new CustomEvent('mapa:ver-barbearia', {
          detail: { id: barbearia.id, name: barbearia.name },
        }));
      };
    });

    return marker;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Ícone
  // ═══════════════════════════════════════════════════════════

  static #icone(b) {
    const avatarUrl    = GpsBarbeariaMarker.#urlAvatar(b.logo_path);
    const iniciais     = GpsBarbeariaMarker.#iniciaisNome(b.name);
    const avatarSeguro = avatarUrl ? GpsBarbeariaMarker.#escapeHtml(avatarUrl) : null;
    const nomeCurto    = GpsBarbeariaMarker.#escapeHtml(
      GpsBarbeariaMarker.#textoCurto(b.name ?? 'Barbearia', 18)
    );
    const numeroEnd    = GpsBarbeariaMarker.#escapeHtml(
      GpsBarbeariaMarker.#numeroEndereco(b.address)
    );
    const initialsStyle = avatarSeguro ? 'display:none' : 'display:flex';

    // Foto da barbearia dentro da vitrine escura
    const windowContent = avatarSeguro
      ? `<img src="${avatarSeguro}" class="mapa-store-mk__window-img" alt="${iniciais}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <span class="mapa-store-mk__initials" style="display:none">${iniciais}</span>`
      : `<span class="mapa-store-mk__initials" style="${initialsStyle}">${iniciais}</span>`;

    // Ícone pequeno no círculo do pin GPS
    const pinContent = avatarSeguro
      ? `<img src="${avatarSeguro}" class="mapa-store-mk__pin-img" alt="">`
      : `<span class="mapa-store-mk__pin-text">${iniciais.slice(0, 1)}</span>`;

    return L.divIcon({
      className:   '',
      html: `<div class="mapa-store-mk">
               <img class="mapa-store-mk__bg" src="/shared/img/store-marker.png" alt="">
               <div class="mapa-store-mk__window">${windowContent}</div>
               <div class="mapa-store-mk__pin-dot">${pinContent}</div>
               <div class="mapa-store-mk__label">
                 <span class="mapa-store-mk__name">${nomeCurto}</span>
                 ${numeroEnd ? `<span class="mapa-store-mk__number">N&ordm;&nbsp;${numeroEnd}</span>` : ''}
               </div>
             </div>`,
      iconSize:    [130, 130],
      iconAnchor:  [104, 114],
      popupAnchor: [0, -116],
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Popup
  // ═══════════════════════════════════════════════════════════

  static #popup(b, distTexto) {
    const avatarUrl      = GpsBarbeariaMarker.#urlAvatar(b.logo_path);
    const iniciais       = GpsBarbeariaMarker.#iniciaisNome(b.name);
    const nomeSeguro     = GpsBarbeariaMarker.#escapeHtml(b.name ?? 'Barbearia');
    const enderecoSeguro = GpsBarbeariaMarker.#escapeHtml(b.address ?? '');
    const cidadeSeguro   = GpsBarbeariaMarker.#escapeHtml(b.city ?? '');
    const numeroEnd      = GpsBarbeariaMarker.#escapeHtml(
      GpsBarbeariaMarker.#numeroEndereco(b.address)
    );
    const avatarSeguro   = avatarUrl ? GpsBarbeariaMarker.#escapeHtml(avatarUrl) : null;

    const popupImgTag = avatarSeguro
      ? `<img src="${avatarSeguro}"
               class="mapa-popup__avatar-img"
               alt="${iniciais}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const popupInitialsStyle = avatarSeguro ? 'display:none' : 'display:flex';

    const statusHtml = b.is_open
      ? `<span class="mapa-popup__badge mapa-popup__badge--open">Aberta</span>`
      : `<span class="mapa-popup__badge mapa-popup__badge--closed">Fechada</span>`;

    const ratingHtml = b.rating_count > 0
      ? `<span class="mapa-popup__rating">⭐ ${Number(b.rating_avg).toFixed(1)}<small>(${b.rating_count})</small></span>`
      : '';

    const distHtml = distTexto
      ? `<span class="mapa-popup__dist">📍 ${distTexto} de você</span>`
      : '';

    const endHtml = enderecoSeguro
      ? `<span class="mapa-popup__addr">${enderecoSeguro}${cidadeSeguro ? ', ' + cidadeSeguro : ''}</span>`
      : '';

    const numHtml = numeroEnd
      ? `<span class="mapa-popup__numero">N&ordm;&nbsp;${numeroEnd}</span>`
      : '';

    return `<div class="mapa-popup">
      <div class="mapa-popup__avatar">
        ${popupImgTag}
        <span class="mapa-popup__avatar-initials" style="${popupInitialsStyle}">${iniciais}</span>
      </div>
      <div class="mapa-popup__info">
        <strong class="mapa-popup__nome">${nomeSeguro}</strong>
        <div class="mapa-popup__meta">${statusHtml}${ratingHtml}</div>
        ${endHtml}
        ${numHtml}
        ${distHtml}
        <button class="gps-marker-popup__btn-ver" type="button">Ver Barbearia →</button>
      </div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Helpers
  // ═══════════════════════════════════════════════════════════

  static #normalizarCoords(b) {
    const lat = Number(b?.latitude);
    const lng = Number(b?.longitude);
    if (!isFinite(lat) || lat < -90  || lat > 90)  return null;
    if (!isFinite(lng) || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  static #urlAvatar(logoPath) {
    if (!logoPath) return null;
    try {
      return ApiService.getLogoUrl(logoPath) ?? null;
    } catch {
      return null;
    }
  }

  static #iniciaisNome(nome) {
    if (!nome) return '💈';
    const palavras = nome.trim().split(/\s+/).filter(Boolean);
    if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
    return (palavras[0][0] + palavras[1][0]).toUpperCase();
  }

  static #textoCurto(valor, limite = 22) {
    const texto = String(valor ?? '').trim().replace(/\s+/g, ' ');
    if (texto.length <= limite) return texto;
    return `${texto.slice(0, Math.max(0, limite - 1)).trim()}…`;
  }

  static #numeroEndereco(address) {
    const partes = String(address ?? '')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    if (partes[1]) return partes[1];
    const match = String(address ?? '').match(/\b\d+[A-Za-z]?\b/);
    return match ? match[0] : '';
  }

  static #escapeHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  static #calcularDistancia(b, posUsuario) {
    if (!posUsuario || b.distance_km != null) {
      const d = b.distance_km;
      if (d == null) return null;
      return d < 1
        ? `${(d * 1000).toFixed(0)} m`
        : `${d.toFixed(1)} km`;
    }
    const lat1 = posUsuario.lat, lon1 = posUsuario.lng;
    const lat2 = Number(b.latitude), lon2 = Number(b.longitude);
    if (!isFinite(lat2) || !isFinite(lon2)) return null;
    const Rt = 6371, d = Math.PI / 180;
    const dLat = (lat2 - lat1) * d, dLon = (lon2 - lon1) * d;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
    const km = Rt * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return km < 1
      ? `${(km * 1000).toFixed(0)} m`
      : `${km.toFixed(1)} km`;
  }
}
