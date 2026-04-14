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

  static #RAIO_KM       = 3;
  static #el             = null;   // container raiz no HTML
  static #buscaEncerrada = false;  // true após "nenhuma barbearia" — não rebusca

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o widget.
   * Se GPS já concedido → carrega lista. Caso contrário deixa o hint HTML intacto.
   * @param {string} containerId
   */
  static async init(containerId) {
    NearbyBarbershopsWidget.#el = document.getElementById(containerId);
    if (!NearbyBarbershopsWidget.#el) return;

    const permissao = await GeoService.verificarPermissao();

    if (permissao === 'granted') {
      await NearbyBarbershopsWidget.#carregar();
    }
    // caso não concedido: hint HTML já está no DOM — não altera nada
  }

  /**
   * Chamado pelo GeoService quando GPS é concedido (mapa ativou o GPS).
   * Limpa o hint e carrega a lista de barbearias.
   */
  static async onGPSConcedido() {
    if (!NearbyBarbershopsWidget.#el) return;
    await NearbyBarbershopsWidget.#carregar();
  }

  /**
   * Chamado pelo GeoService quando GPS é negado — hint permanece visível.
   */
  static onGPSNegado() {
    // hint HTML já está no DOM — não faz nada
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fluxo
  // ═══════════════════════════════════════════════════════════

  static async #carregar() {
    // Se a busca já foi encerrada por ausência de resultados, não reexecuta
    if (NearbyBarbershopsWidget.#buscaEncerrada) return;
    NearbyBarbershopsWidget.#renderLoading();
    try {
      const pos   = await GeoService.obter();
      const lista = await NearbyBarbershopsWidget.#buscarBarbearias(pos.lat, pos.lng);
      lista.length
        ? NearbyBarbershopsWidget.#renderLista(lista)
        : NearbyBarbershopsWidget.#renderVazio();
    } catch (_err) {
      // silencioso — se GPS falhar o hint original não está mais, limpa
      NearbyBarbershopsWidget.#el.innerHTML = '';
    }
  }

  static async #buscarBarbearias(lat, lng) {
    const R    = NearbyBarbershopsWidget.#RAIO_KM;
    const latD = R / 111.0;
    const lonD = R / (111.0 * Math.cos(lat * Math.PI / 180));

    const { data, error } = await SupabaseService.client
      .from('barbershops')
      .select('id, name, slug, address, city, latitude, longitude, logo_path, is_open, rating_avg, rating_count')
      .eq('is_active', true)
      .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
      .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
      .limit(30);

    if (error) throw new Error('N\u00e3o foi poss\u00edvel carregar as barbearias.');

    return (data ?? [])
      .map(s => ({
        ...s,
        distance_km: parseFloat(NearbyBarbershopsWidget.#haversine(lat, lng, s.latitude, s.longitude).toFixed(2)),
      }))
      .filter(s => s.distance_km <= R)
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  static #haversine(lat1, lon1, lat2, lon2) {
    const Rt = 6371, d = Math.PI / 180;
    const dLat = (lat2 - lat1) * d, dLon = (lon2 - lon1) * d;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
    return Rt * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  /** Estado: nenhuma barbearia encontrada — exibe mensagem e encerra a busca */
  static #renderVazio() {
    if (!NearbyBarbershopsWidget.#el) return;
    NearbyBarbershopsWidget.#buscaEncerrada = true;

    const wrap = document.createElement('div');
    wrap.className = 'nearby-vazio';

    const icone = document.createElement('span');
    icone.className = 'nearby-vazio-icone';
    icone.textContent = '📍';

    const titulo = document.createElement('p');
    titulo.className = 'nearby-vazio-titulo';
    titulo.textContent = 'Nenhuma barbearia por perto';

    const sub = document.createElement('p');
    sub.className = 'nearby-vazio-sub';
    sub.textContent = `Não encontramos barbearias em até ${NearbyBarbershopsWidget.#RAIO_KM} km da sua localização.`;

    wrap.appendChild(icone);
    wrap.appendChild(titulo);
    wrap.appendChild(sub);
    NearbyBarbershopsWidget.#montar(wrap);
  }

  /**
   * Cria um .barber-row a partir dos dados de uma barbearia.
   */
  static #criarBarberRow(b) {
    const row = document.createElement('div');
    row.className = 'barber-row barber-card';

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
    sub.textContent = `📍 ${b.address} · ⭐ ${Number(b.rating_avg ?? 0).toFixed(1)} · Barbearia · ${Number(b.distance_km).toFixed(1)} km`;

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

    const btn = document.createElement('button');
    btn.className = 'btn btn-gold btn-sm barber-action';
    btn.type = 'button';
    btn.textContent = 'Agendar';

    meta.appendChild(stars);
    meta.appendChild(badge);
    meta.appendChild(btn);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    return row;
  }
}

