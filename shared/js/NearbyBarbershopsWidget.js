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
// Dependências: GeoService.js, BarbershopRepository.js, BarbershopService.js
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

  /**
   * Renderiza cards de barbearias na seção "Populares" da home.
   * Não exige GPS — busca todas as barbearias ativas (limit 10).
   * Se GPS disponível, ordena por proximidade.
   * @param {string} containerId
   */
  static async initHomeCards(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Skeleton loading
    el.innerHTML = Array(3).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:120px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
          <p class="barber-sub"  style="width:80px;height:11px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');

    try {
      let lista = await BarbershopRepository.getAll(10);

      // Se GPS disponível, calcula distância
      try {
        const permissao = await GeoService.verificarPermissao();
        if (permissao === 'granted') {
          const pos = await GeoService.obter();
          lista = lista
            .map(b => ({ ...b, distance_km: b.latitude
              ? parseFloat(NearbyBarbershopsWidget.#haversine(pos.lat, pos.lng, b.latitude, b.longitude).toFixed(1))
              : null }))
            .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
        }
      } catch (_) { /* sem GPS — mantém ordem por rating */ }

      el.innerHTML = '';
      lista.forEach(b => {
        const row = NearbyBarbershopsWidget.#criarBarberRow(b);
        el.appendChild(row);
      });
    } catch (err) {
      console.error('[NearbyBarbershopsWidget] initHomeCards exception:', err);
      el.innerHTML = '';
    }
  }

  /**
   * Renderiza cards de barbearias na seção "Em Destaque" da home (scroll horizontal).
   * Busca até 6 barbearias ativas ordenadas por rating.
   * @param {string} containerId  — id do .h-scroll
   */
  static async initHomeDestaque(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Skeleton 4 cards
    el.innerHTML = Array(4).fill(0).map(() => `
      <div class="destaque-item">
        <div class="destaque-card destaque-card--skeleton" aria-hidden="true">
          <div class="dc-header">
            <div class="dc-left">
              <div class="dc-avatar dc-avatar--skel"></div>
              <div class="dc-skel" style="width:44px;height:10px;border-radius:99px;"></div>
            </div>
            <div class="dc-actions">
              <div class="dc-skel" style="width:38px;height:22px;border-radius:20px;"></div>
              <div class="dc-skel" style="width:38px;height:22px;border-radius:20px;"></div>
              <div class="dc-skel" style="width:28px;height:22px;border-radius:20px;"></div>
            </div>
          </div>
          <div class="dc-skel" style="width:80%;height:12px;"></div>
          <div class="dc-card-footer">
            <div class="dc-skel" style="width:70px;height:14px;margin:0 auto;"></div>
          </div>
        </div>
        <div class="dc-skel" style="width:85%;height:10px;margin:0 auto;border-radius:6px;"></div>
      </div>`).join('');

    try {
      const lista = await BarbershopRepository.getFeatured(6);
      if (!lista.length) { el.innerHTML = ''; return; }

      el.innerHTML = '';
      const cardsEls = [];

      lista.forEach(b => {
        const likes    = Number(b.likes_count    ?? 0);
        const dislikes = Number(b.dislikes_count ?? 0);
        // Usa rating_score do banco se disponível, senão calcula a partir do rating_avg
        const score = b.rating_score != null
          ? Number(b.rating_score)
          : BarbershopService.calcRatingScore(likes, dislikes) || Number(b.rating_avg ?? 0);
        const fillPct = ((score / 5) * 100).toFixed(1);

        // ── Wrapper externo (card + endereço abaixo) ──────
        const item = document.createElement('div');
        item.className = 'destaque-item';

        const card = document.createElement('div');
        card.className = 'destaque-card';
        card.dataset.barbershopId = b.id;
        card.dataset.likes        = likes;
        card.dataset.dislikes     = dislikes;

        // ── Avatar / Logo ──────────────────────────────────
        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'dc-avatar';
        if (b.logo_path) {
          const img = document.createElement('img');
          img.alt = b.name;
          img.loading = 'lazy';
          img.onerror = () => { avatarWrap.textContent = '💈'; };
          img.src = SupabaseService.getLogoUrl(b.logo_path) || '';
          avatarWrap.appendChild(img);
        } else {
          avatarWrap.textContent = '💈';
        }

        // ── Badge aberto/fechado (abaixo do avatar, no dc-left) ──
        const badge = document.createElement('span');
        badge.className = b.is_open ? 'dc-badge dc-badge--open' : 'dc-badge dc-badge--closed';
        badge.textContent = b.is_open ? 'Aberto' : 'Fechado';

        // ── Coluna esquerda: avatar + badge ───────────────
        const dcLeft = document.createElement('div');
        dcLeft.className = 'dc-left';
        dcLeft.appendChild(avatarWrap);
        dcLeft.appendChild(badge);

        // ── Botões de ação (coluna direita: like → dislike → favorito) ──
        const btnLike = document.createElement('button');
        btnLike.type = 'button';
        btnLike.className = 'dc-btn like';
        btnLike.dataset.action = 'barbershop-like';
        btnLike.title = 'Curtir esta barbearia';
        btnLike.setAttribute('aria-label', 'Curtir');
        btnLike.innerHTML = `<span class="dc-btn-icon">👍</span><span class="dc-count">${likes}</span>`;

        const btnDislike = document.createElement('button');
        btnDislike.type = 'button';
        btnDislike.className = 'dc-btn dislike';
        btnDislike.dataset.action = 'barbershop-dislike';
        btnDislike.title = 'Feedback negativo';
        btnDislike.setAttribute('aria-label', 'Feedback negativo');
        btnDislike.innerHTML = `<span class="dc-btn-icon">👎</span><span class="dc-count">${dislikes}</span>`;

        const btnFav = document.createElement('button');
        btnFav.type = 'button';
        btnFav.className = 'dc-btn favorite';
        btnFav.dataset.action = 'barbershop-favorite';
        btnFav.title = 'Adicionar aos favoritos';
        btnFav.setAttribute('aria-label', 'Favoritar');
        btnFav.setAttribute('aria-pressed', 'false');
        btnFav.innerHTML = `<span class="dc-btn-icon">⭐</span>`;

        const actions = document.createElement('div');
        actions.className = 'dc-actions';
        actions.appendChild(btnLike);
        actions.appendChild(btnDislike);
        actions.appendChild(btnFav);

        // ── Header: avatar (esq) + ações em coluna (dir) ──
        const dcHeader = document.createElement('div');
        dcHeader.className = 'dc-header';
        dcHeader.appendChild(dcLeft);
        dcHeader.appendChild(actions);

        // ── Nome ──────────────────────────────────────────
        const nome = document.createElement('p');
        nome.className = 'dc-nome';
        nome.textContent = b.name;

        // ── Rodapé do card: estrelas + pontuação ──────────
        const starsWrap = document.createElement('div');
        starsWrap.className = 'dc-stars-wrap';
        starsWrap.innerHTML = `
          <span class="dc-stars-base" aria-hidden="true">★★★★★</span>
          <span class="dc-stars-fill" style="width:${fillPct}%" aria-hidden="true">★★★★★</span>`;

        const scoreNum = document.createElement('span');
        scoreNum.className = 'dc-rating-num';
        scoreNum.setAttribute('aria-label', `Pontuação: ${score.toFixed(1)} de 5`);
        scoreNum.textContent = score.toFixed(1);

        const starsRow = document.createElement('div');
        starsRow.className = 'dc-stars-row';
        starsRow.appendChild(starsWrap);
        starsRow.appendChild(scoreNum);

        const cardFooter = document.createElement('div');
        cardFooter.className = 'dc-card-footer';
        cardFooter.appendChild(starsRow);

        // ── Monta card ────────────────────────────────────
        card.appendChild(dcHeader);
        card.appendChild(nome);
        card.appendChild(cardFooter);

        // ── Endereço — fora do card, abaixo ───────────────
        const addr = document.createElement('p');
        addr.className = 'dc-addr';
        addr.textContent = b.address || b.city || '';

        item.appendChild(card);
        item.appendChild(addr);
        el.appendChild(item);
        cardsEls.push(card);
      });

      // Restaura estado ativo dos botões (usuário logado)
      BarbershopService.restaurarInteracoes(cardsEls);

    } catch (err) {
      console.error('[NearbyBarbershopsWidget] initHomeDestaque exception:', err);
      el.innerHTML = '';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fluxo
  // ═══════════════════════════════════════════════════════════

  /**
   * Renderiza barbeiros (professionals) na seção "Barbeiros Populares" da home.
   * Busca profiles com role='professional' e pro_type='barbeiro', limit 10.
   * @param {string} containerId
   */
  static async initHomeBarbeiros(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Skeleton
    el.innerHTML = Array(3).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:110px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
          <p class="barber-sub"  style="width:70px;height:11px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');

    try {
      const lista = await BarbershopRepository.getBarbers(10);
      if (!lista.length) { el.innerHTML = ''; return; }

      el.innerHTML = '';
      lista.forEach(p => {
        const row = document.createElement('div');
        row.className = 'barber-row barber-card';

        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'avatar gold';
        if (p.avatar_path) {
          const img = document.createElement('img');
          img.alt = p.full_name;
          img.onerror = () => { avatarWrap.textContent = '💈'; };
          img.src = SupabaseService.getAvatarUrl(p.avatar_path) || '';
          avatarWrap.appendChild(img);
        } else {
          avatarWrap.textContent = '💈';
        }

        const info = document.createElement('div');
        info.className = 'barber-info';

        const nome = document.createElement('p');
        nome.className = 'barber-name';
        nome.textContent = p.full_name || 'Barbeiro';

        const sub = document.createElement('p');
        sub.className = 'barber-sub';
        sub.textContent = 'Barbeiro Profissional';

        info.appendChild(nome);
        info.appendChild(sub);

        const meta = document.createElement('div');
        meta.className = 'barber-meta';

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Barbeiro';

        meta.appendChild(badge);

        row.appendChild(avatarWrap);
        row.appendChild(info);
        row.appendChild(meta);
        el.appendChild(row);
      });
    } catch (err) {
      console.error('[NearbyBarbershopsWidget] initHomeBarbeiros exception:', err);
      el.innerHTML = '';
    }
  }


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
    return BarbershopRepository.getNearby(lat, lng, NearbyBarbershopsWidget.#RAIO_KM);
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

    const titulo = document.createElement('p');
    titulo.className = 'nearby-vazio-titulo';
    titulo.textContent = 'Nenhuma barbearia por perto';

    const sub = document.createElement('p');
    sub.className = 'nearby-vazio-sub';
    sub.textContent = `Não encontramos barbearias em até ${NearbyBarbershopsWidget.#RAIO_KM} km da sua localização.`;

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

    meta.appendChild(stars);
    meta.appendChild(badge);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    return row;
  }
}

