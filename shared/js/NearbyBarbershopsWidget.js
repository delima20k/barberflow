'use strict';

// =============================================================
// NearbyBarbershopsWidget.js — Barbearias próximas (POO, Singleton)
//
// Responsabilidades:
//   - Verificar permissão GPS no init
//   - Se já concedida: carregar barbearias automaticamente (botão hidden)
//   - Se negada/prompt: mostrar botão radondo "Ativar GPS"
//   - Reação ao GeoService (onGPSConcedido / onGPSNegado)
//
// Dependências: GeoService.js, SupabaseService.js
// =============================================================

class NearbyBarbershopsWidget {

  static #RAIO_KM = 2;
  static #el      = null;   // container raiz no HTML

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o widget.
   * Verifica a permissão atual e decide o estado inicial.
   * @param {string} containerId
   */
  static async init(containerId) {
    NearbyBarbershopsWidget.#el = document.getElementById(containerId);
    if (!NearbyBarbershopsWidget.#el) return;

    const permissao = await GeoService.verificarPermissao();

    if (permissao === 'granted') {
      // GPS já liberado — carrega direto, sem botão
      await NearbyBarbershopsWidget.#carregar();
    } else {
      // Negado ou primeira vez — mostra botão
      NearbyBarbershopsWidget.#renderBotaoGPS();
    }
  }

  /**
   * Chamado pelo GeoService quando GPS é concedido na primeira abertura.
   */
  static async onGPSConcedido() {
    if (!NearbyBarbershopsWidget.#el) return;
    NearbyBarbershopsWidget.#ocultarBotaoGPS();
    await NearbyBarbershopsWidget.#carregar();
  }

  /**
   * Chamado pelo GeoService quando GPS é negado na primeira abertura.
   */
  static onGPSNegado() {
    NearbyBarbershopsWidget.#exibirBotaoGPS();
  }

  /**
   * Acionado pelo botão "Ativar GPS" no HTML.
   */
  static async ativarGPS() {
    NearbyBarbershopsWidget.#ocultarBotaoGPS();
    NearbyBarbershopsWidget.#renderLoading();
    try {
      await GeoService.obter();
      await NearbyBarbershopsWidget.#carregar();
    } catch (err) {
      NearbyBarbershopsWidget.#exibirBotaoGPS();
      NearbyBarbershopsWidget.#renderErroInline(err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fluxo
  // ═══════════════════════════════════════════════════════════

  static async #carregar() {
    NearbyBarbershopsWidget.#renderLoading();
    try {
      const pos   = await GeoService.obter();
      const lista = await NearbyBarbershopsWidget.#buscarBarbearias(pos.lat, pos.lng);
      lista.length
        ? NearbyBarbershopsWidget.#renderLista(lista)
        : NearbyBarbershopsWidget.#renderVazio();
    } catch (err) {
      NearbyBarbershopsWidget.#renderBotaoGPS(err.message);
    }
  }

  static async #buscarBarbearias(lat, lng) {
    const { data, error } = await SupabaseService.client.functions.invoke(
      'nearby-barbershops',
      { body: { latitude: lat, longitude: lng, radius_km: NearbyBarbershopsWidget.#RAIO_KM } }
    );
    if (error) throw new Error('Não foi possível carregar as barbearias.');
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Controle do botão GPS no map-box
  // ═══════════════════════════════════════════════════════════

  static #ocultarBotaoGPS() {
    const btn = document.getElementById('btn-ativar-gps');
    if (btn) btn.style.display = 'none';
  }

  static #exibirBotaoGPS() {
    const btn = document.getElementById('btn-ativar-gps');
    if (btn) btn.style.display = '';
  }

  static #renderErroInline(mensagem) {
    if (!NearbyBarbershopsWidget.#el) return;
    const p = document.createElement('p');
    p.className   = 'nearby-gps-msg';
    p.style.color = 'var(--danger)';
    p.textContent = mensagem;
    NearbyBarbershopsWidget.#el.innerHTML = '';
    NearbyBarbershopsWidget.#el.appendChild(p);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — DOM (resultados)
  // ═══════════════════════════════════════════════════════════

  static #montar(node) {
    NearbyBarbershopsWidget.#el.innerHTML = '';
    NearbyBarbershopsWidget.#el.appendChild(node);
  }

  /** Botão redondo "Ativar GPS" (aparece só se permissão negada/pendente) */
  static #renderBotaoGPS(erro = null) {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-gps-off';

    const icone = document.createElement('span');
    icone.className   = 'nearby-gps-icon';
    icone.textContent = erro ? '⚠️' : '📍';

    const msg = document.createElement('p');
    msg.className   = 'nearby-gps-msg';
    msg.textContent = erro ?? 'Ative o GPS para ver barbearias perto de você.';

    const btn = document.createElement('button');
    btn.className   = 'btn btn-gold nearby-gps-btn nearby-gps-btn-round';
    btn.textContent = '📍 Ativar GPS';
    btn.addEventListener('click', () => NearbyBarbershopsWidget.ativarGPS());

    wrap.appendChild(icone);
    wrap.appendChild(msg);
    wrap.appendChild(btn);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: carregando */
  static #renderLoading() {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-loading';

    const spinner = document.createElement('span');
    spinner.className = 'nearby-spinner';

    const msg = document.createElement('p');
    msg.textContent = 'Buscando barbearias próximas…';

    wrap.appendChild(spinner);
    wrap.appendChild(msg);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: lista de barbearias */
  static #renderLista(lista) {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-lista';
    lista.forEach(b => wrap.appendChild(NearbyBarbershopsWidget.#criarBarberRow(b)));
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: nenhuma barbearia encontrada */
  static #renderVazio() {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-gps-off';

    const icone = document.createElement('span');
    icone.className   = 'nearby-gps-icon';
    icone.textContent = '🔍';

    const msg = document.createElement('p');
    msg.className   = 'nearby-gps-msg';
    msg.textContent = `Nenhuma barbearia encontrada em ${NearbyBarbershopsWidget.#RAIO_KM} km de você.`;

    wrap.appendChild(icone);
    wrap.appendChild(msg);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /**
   * Cria um .barber-row a partir dos dados de uma barbearia.
   */
  static #criarBarberRow(b) {
    const row = document.createElement('div');
    row.className = 'barber-row';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img   = document.createElement('img');
      img.src     = b.logo_path;
      img.alt     = b.name;
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = b.name;

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = `${b.address} · ${Number(b.distance_km).toFixed(1)} km`;

    info.appendChild(nome);
    info.appendChild(sub);

    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const stars = document.createElement('span');
    stars.className   = 'stars';
    stars.textContent = `★ ${Number(b.rating_avg ?? 0).toFixed(1)}`;

    const badge = document.createElement('span');
    badge.className   = b.is_open ? 'badge' : 'badge closed';
    badge.textContent = b.is_open ? 'Aberto' : 'Fechado';

    meta.appendChild(stars);
    meta.appendChild(badge);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    return row;
  }
}

// Auto-inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () =>
  NearbyBarbershopsWidget.init('nearby-map-widget')
);

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o widget dentro do container informado.
   * @param {string} containerId — id do elemento raiz no HTML
   */
  static init(containerId) {
    NearbyBarbershopsWidget.#el = document.getElementById(containerId);
    if (!NearbyBarbershopsWidget.#el) return;
    NearbyBarbershopsWidget.#renderGpsOff();
  }

  /**
   * Chamado pelo botão "Ativar GPS" no widget.
   * Solicita posição e busca barbearias próximas.
   */
  static async ativarGPS() {
    NearbyBarbershopsWidget.#renderLoading();
    try {
      const pos       = await GeoService.obter();
      const lista     = await NearbyBarbershopsWidget.#buscarBarbearias(pos.lat, pos.lng);
      if (!lista.length) {
        NearbyBarbershopsWidget.#renderVazio();
      } else {
        NearbyBarbershopsWidget.#renderLista(lista);
      }
    } catch (err) {
      NearbyBarbershopsWidget.#renderErro(err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Busca de dados
  // ═══════════════════════════════════════════════════════════

  /**
   * Chama a Edge Function Supabase e retorna array de barbearias.
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<Array>}
   */
  static async #buscarBarbearias(lat, lng) {
    const { data, error } = await SupabaseService.client.functions.invoke(
      'nearby-barbershops',
      { body: { latitude: lat, longitude: lng, radius_km: NearbyBarbershopsWidget.#RAIO_KM } }
    );
    if (error) throw new Error('Não foi possível carregar as barbearias.');
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Criação de DOM
  // ═══════════════════════════════════════════════════════════

  /**
   * Substitui o conteúdo do container por um novo estado.
   * @param {HTMLElement} node
   */
  static #montar(node) {
    NearbyBarbershopsWidget.#el.innerHTML = '';
    NearbyBarbershopsWidget.#el.appendChild(node);
  }

  /** Estado: GPS desligado — exibe botão de ativação */
  static #renderGpsOff() {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-gps-off';

    const icone = document.createElement('span');
    icone.className = 'nearby-gps-icon';
    icone.textContent = '📍';

    const msg = document.createElement('p');
    msg.className = 'nearby-gps-msg';
    msg.textContent = 'Ative o GPS para ver barbearias perto de você';

    const btn = document.createElement('button');
    btn.className = 'btn btn-gold nearby-gps-btn';
    btn.textContent = 'Ativar GPS';
    btn.addEventListener('click', () => NearbyBarbershopsWidget.ativarGPS());

    wrap.appendChild(icone);
    wrap.appendChild(msg);
    wrap.appendChild(btn);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: carregando */
  static #renderLoading() {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-loading';

    const spinner = document.createElement('span');
    spinner.className = 'nearby-spinner';

    const msg = document.createElement('p');
    msg.textContent = 'Buscando barbearias próximas…';

    wrap.appendChild(spinner);
    wrap.appendChild(msg);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: lista de barbearias */
  static #renderLista(lista) {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-lista';

    lista.forEach(b => wrap.appendChild(NearbyBarbershopsWidget.#criarBarberRow(b)));
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: nenhuma barbearia encontrada */
  static #renderVazio() {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-gps-off';

    const icone = document.createElement('span');
    icone.className = 'nearby-gps-icon';
    icone.textContent = '🔍';

    const msg = document.createElement('p');
    msg.className = 'nearby-gps-msg';
    msg.textContent = `Nenhuma barbearia encontrada em ${NearbyBarbershopsWidget.#RAIO_KM} km de você.`;

    wrap.appendChild(icone);
    wrap.appendChild(msg);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /** Estado: erro */
  static #renderErro(mensagem) {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-gps-off';

    const icone = document.createElement('span');
    icone.className = 'nearby-gps-icon';
    icone.textContent = '⚠️';

    const msg = document.createElement('p');
    msg.className = 'nearby-gps-msg';
    msg.textContent = mensagem;

    const btn = document.createElement('button');
    btn.className = 'btn btn-outline nearby-gps-btn';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => NearbyBarbershopsWidget.ativarGPS());

    wrap.appendChild(icone);
    wrap.appendChild(msg);
    wrap.appendChild(btn);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /**
   * Cria um .barber-row a partir dos dados de uma barbearia.
   * @param {{ name, address, rating_avg, distance_km, is_open, logo_path }} b
   * @returns {HTMLElement}
   */
  static #criarBarberRow(b) {
    const row = document.createElement('div');
    row.className = 'barber-row';

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img = document.createElement('img');
      img.src    = b.logo_path;
      img.alt    = b.name;
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    // Info
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className = 'barber-name';
    nome.textContent = b.name;

    const sub = document.createElement('p');
    sub.className = 'barber-sub';
    sub.textContent = `${b.address} · ${Number(b.distance_km).toFixed(1)} km`;

    info.appendChild(nome);
    info.appendChild(sub);

    // Meta
    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.textContent = `★ ${Number(b.rating_avg ?? 0).toFixed(1)}`;

    const badge = document.createElement('span');
    badge.className = b.is_open ? 'badge' : 'badge closed';
    badge.textContent = b.is_open ? 'Aberto' : 'Fechado';

    meta.appendChild(stars);
    meta.appendChild(badge);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    return row;
  }
}

// Auto-inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () =>
  NearbyBarbershopsWidget.init('nearby-barbershops-widget')
);
