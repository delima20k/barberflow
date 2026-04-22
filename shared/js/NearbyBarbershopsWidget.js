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

  static #RAIO_KM       = 5;
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

    // Reseta a flag toda vez que a tela é re-iniciada (SPA — sem reload de página)
    NearbyBarbershopsWidget.#buscaEncerrada = false;

    // Escuta eventos de GPS do GeoService — sem dependência direta
    document.addEventListener('geo:concedido', () => NearbyBarbershopsWidget.onGPSConcedido(), { once: false });
    document.addEventListener('geo:negado',    () => NearbyBarbershopsWidget.onGPSNegado(),    { once: false });

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

    // Skeleton — 2 colunas de 2 cards
    el.innerHTML = Array(3).fill(0).map(() => `
      <div class="barbearias-coluna">
        <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
          <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
          <div class="barber-info">
            <p class="barber-name" style="width:100px;height:13px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
            <p class="barber-sub"  style="width:70px;height:10px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:5px"></p>
          </div>
        </div>
        <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
          <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
          <div class="barber-info">
            <p class="barber-name" style="width:90px;height:13px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
            <p class="barber-sub"  style="width:60px;height:10px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:5px"></p>
          </div>
        </div>
      </div>`).join('');

    // ── 1. Carrega lista base (sem GPS, rápido e confiável) ──────────────
    let lista = [];
    try {
      lista = await BarbershopRepository.getAll(20);
    } catch (err) {
      LoggerService.error('[NearbyBarbershopsWidget] initHomeCards getAll falhou:', err);
      // Mantém skeleton visível e sai — sem limpar
      return;
    }

    if (!lista.length) { el.innerHTML = ''; return; }

    // ── 2. Tenta enriquecer com distância GPS (opcional, sem bloquear) ───
    try {
      const permissao = await GeoService.verificarPermissao();
      if (permissao === 'granted') {
        const pos = await GeoService.obter();
        const nearby = await BarbershopRepository.getNearby(pos.lat, pos.lng, NearbyBarbershopsWidget.#RAIO_KM);
        if (nearby.length) {
          lista = nearby.map(b => ({
            ...b,
            distance_km: b.latitude
              ? parseFloat(NearbyBarbershopsWidget.#haversine(pos.lat, pos.lng, b.latitude, b.longitude).toFixed(1))
              : null,
          }));
        }
      }
    } catch (_) { /* GPS indisponível — usa getAll já carregado */ }

    // ── 3. Normaliza logo_path para URL completa ─────────────────────────
    lista = lista.map(b => ({
      ...b,
      logo_path: b.logo_path ? SupabaseService.getLogoUrl(b.logo_path) : null,
    }));

    // ── 4. Renderiza ─────────────────────────────────────────────────────
    el.innerHTML = '';
    for (let i = 0; i < lista.length; i += 2) {
      const coluna = document.createElement('div');
      coluna.className = 'barbearias-coluna';
      coluna.appendChild(NearbyBarbershopsWidget.#criarBarberRow(lista[i]));
      if (lista[i + 1]) coluna.appendChild(NearbyBarbershopsWidget.#criarBarberRow(lista[i + 1]));
      el.appendChild(coluna);
    }

    // ── 5. Restaura interações (favoritos / likes) ───────────────────────
    try {
      await BarbershopService.carregarFavoritos();
    } catch (_) { /* silencioso */ }
    BarbershopService.restaurarInteracoes([...el.querySelectorAll('[data-barbershop-id]')]);
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
      // Pre-carrega favoritos do usuário (cache, idempotente)
      try { await BarbershopService.carregarFavoritos(); } catch { /* silencioso */ }

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

        // ── Coluna esquerda: apenas avatar ────────────────
        const dcLeft = document.createElement('div');
        dcLeft.className = 'dc-left';
        dcLeft.appendChild(avatarWrap);

        // ── Header (só o avatar à esquerda — ações foram para o canto superior direito) ──
        const dcHeader = document.createElement('div');
        dcHeader.className = 'dc-header';
        dcHeader.appendChild(dcLeft);

        // ── Canto superior direito: badge (Aberto/Fechado) + favorito (com confetes) ──
        const topActions = document.createElement('div');
        topActions.className = 'top-card__actions';

        const badge = document.createElement('span');
        badge.className = b.is_open ? 'dc-badge dc-badge--open' : 'dc-badge dc-badge--closed';
        badge.textContent = b.is_open ? 'Aberto' : 'Fechado';
        topActions.appendChild(badge);

        topActions.appendChild(BarbershopService.criarBotaoFavoritoCard(b.id));

        // ── Nome ──────────────────────────────────────────
        const nome = document.createElement('p');
        nome.className = 'dc-nome';
        nome.textContent = b.name;

        // ── Rodapé do card: usa .top-card__stars (estrelas + num + likes clicável) ──
        const starsRow = document.createElement('div');
        starsRow.className = 'top-card__stars';
        starsRow.innerHTML = `
          ${BarbershopService.criarEstrelasHTML(score)}
          <span class="dc-rating-num">${score.toFixed(1)}</span>
          <button type="button" class="top-card__likes" data-action="barbershop-like"
                  aria-label="Curtir barbearia" title="Curtir barbearia">
            <span class="tcl-ico">👍</span><span class="dc-count">${likes}</span>
          </button>`;

        const cardFooter = document.createElement('div');
        cardFooter.className = 'dc-card-footer';
        cardFooter.appendChild(starsRow);

        // ── Monta card ────────────────────────────────────
        card.appendChild(topActions);
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
      LoggerService.error('[NearbyBarbershopsWidget] initHomeDestaque exception:', err);
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
        </div>
      </div>`).join('');

    try {
      const lista = await BarbershopRepository.getBarbers(10);
      if (!lista.length) { el.innerHTML = ''; return; }

      // Preload interações em cache (idempotente)
      try { await ProfessionalService.carregarInteracoes(); } catch { /* silencioso */ }

      el.innerHTML = '';
      const barbeiroCards = [];
      lista.forEach(p => {
        const ratingCount = parseInt(p.rating_count || 0, 10);
        const ratingVal   = ProfessionalService.estrelasPorCurtidas(ratingCount);

        const row = document.createElement('div');
        row.className = 'barber-row barber-card';
        row.dataset.professionalId = p.id;

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
        info.appendChild(nome);

        if (p.pro_type === 'barbearia') {
          const badge = document.createElement('span');
          badge.className   = 'barber-owner-badge';
          badge.textContent = '🏪 Tem Barbearia';
          info.appendChild(badge);
        }

        // Rodapé padrão: top-card__stars (estrelas fill + rating + like clicável verde)
        const starsRow = document.createElement('div');
        starsRow.className = 'top-card__stars';
        starsRow.innerHTML = `
          ${BarbershopService.criarEstrelasHTML(ratingVal)}
          <span class="dc-rating-num">${ratingVal.toFixed(1)}</span>`;
        starsRow.appendChild(ProfessionalService.criarBotaoLike(p.id, ratingCount));

        info.appendChild(starsRow);

        row.appendChild(avatarWrap);
        row.appendChild(info);

        // Canto superior direito: apenas favorito com confetes
        const actions = document.createElement('div');
        actions.className = 'top-card__actions';
        actions.appendChild(ProfessionalService.criarBotaoFavorito(p.id));
        row.appendChild(actions);

        el.appendChild(row);
        barbeiroCards.push(row);
      });

      // Restaura contadores de curtidas para todos (inclusive anônimos)
      // getProfessionalLikeCountsDirect conta de professional_likes diretamente
      try {
        const ids    = lista.map(p => p.id).filter(Boolean);
        const counts = await ProfileRepository.getProfessionalLikeCountsDirect(ids);
        barbeiroCards.forEach(card => {
          const id = card.dataset.professionalId;
          if (!id || counts[id] === undefined) return;
          const total = counts[id];
          const val   = ProfessionalService.estrelasPorCurtidas(total);
          const likeBtn = card.querySelector('[data-action="professional-like"]');
          if (likeBtn) {
            const cnt = likeBtn.querySelector('.dc-count');
            if (cnt) cnt.textContent = total;
          }
          BarbershopService.atualizarEstrelaCard(card, val);
        });
      } catch (_) { /* silencioso — contadores do render inicial permanecem */ }

    } catch (err) {
      LoggerService.error('[NearbyBarbershopsWidget] initHomeBarbeiros exception:', err);
      el.innerHTML = '';
    }
  }


  static async #carregar() {
    NearbyBarbershopsWidget.#buscaEncerrada = false;
    NearbyBarbershopsWidget.#atualizarContador(-1); // estado: buscando
    NearbyBarbershopsWidget.#renderLoading();
    try {
      const pos   = await GeoService.obter();
      const lista = await NearbyBarbershopsWidget.#buscarBarbearias(pos.lat, pos.lng);
      NearbyBarbershopsWidget.#atualizarContador(lista.length);
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

  /** Estado: nenhuma barbearia encontrada */
  static #renderVazio() {
    if (!NearbyBarbershopsWidget.#el) return;

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
   * Atualiza o texto do contador de barbearias próximas no topo da seção.
   * Procura elemento com id="nearby-contador" no DOM pai do widget.
   * @param {number} total  — -1 = buscando, 0 = nenhuma, N = encontradas
   */
  static #atualizarContador(total) {
    const el = document.getElementById('nearby-contador');
    if (!el) return;
    if (total < 0) {
      el.textContent = 'Buscando barbearias…';
    } else if (total === 0) {
      el.textContent = 'Nenhuma barbearia por perto';
    } else {
      const plural = total === 1 ? 'barbearia' : 'barbearias';
      el.textContent = `${total} ${plural} por perto`;
    }
  }

  /**
   * Renderiza TODAS as barbearias em linhas 380×114, ordenadas por cortes realizados.
   * Reutiliza #criarBarberRow (POO — sem duplicação).
   * @param {string} containerId
   */
  static async initHomeTodas(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Skeleton — 4 linhas de barber-row
    el.innerHTML = Array(4).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;min-height:114px;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:130px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
          <p class="barber-sub"  style="width:90px;height:11px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');

    try {
      const lista = await BarbershopRepository.getAllByCortes(60);
      if (!lista.length) { el.innerHTML = ''; return; }

      el.innerHTML = '';
      // Normaliza logo_path para URL completa e reutiliza #criarBarberRow
      lista.forEach(b => {
        const bc = {
          ...b,
          logo_path: b.logo_path ? SupabaseService.getLogoUrl(b.logo_path) : null,
        };
        const row = NearbyBarbershopsWidget.#criarBarberRow(bc);
        // Enriquece endereço com nº de cortes
        const subEl = row.querySelector('.barber-addr');
        const addrBase = b.address || b.city || '';
        const cortes   = Number(b.rating_count ?? 0);
        if (subEl) subEl.textContent = addrBase
          ? `📍 ${addrBase} · ${cortes} cortes`
          : cortes ? `${cortes} cortes realizados` : '';
        el.appendChild(row);
      });

      // Restaura contadores reais para todos (inclusive anônimos)
      BarbershopService.restaurarInteracoes([...el.querySelectorAll('[data-barbershop-id]')]);

    } catch (err) {
      LoggerService.error('[NearbyBarbershopsWidget] initHomeTodas exception:', err);
      el.innerHTML = '';
    }
  }

  static #criarBarberRow(b) {
    const likes    = Number(b.likes_count    ?? 0);
    const dislikes = Number(b.dislikes_count ?? 0);
    const score    = b.rating_score != null
      ? Number(b.rating_score)
      : BarbershopService.calcRatingScore(likes, dislikes) || Number(b.rating_avg ?? 0);

    const row = document.createElement('div');
    row.className = 'barber-row barber-card';
    if (b?.id) row.dataset.barbershopId = b.id;
    row.dataset.likes    = likes;
    row.dataset.dislikes = dislikes;

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
    sub.className   = 'barber-addr';
    const distStr = b.distance_km != null ? ` · ${Number(b.distance_km).toFixed(1)} km` : '';
    const addrStr = b.address || b.city || '';
    sub.textContent = addrStr ? `📍 ${addrStr}${distStr}` : '';

    // Rodapé padrão: top-card__stars (estrelas fill + rating + like clicável verde)
    const starsRow = document.createElement('div');
    starsRow.className = 'top-card__stars';
    starsRow.innerHTML = `
      ${BarbershopService.criarEstrelasHTML(score)}
      <span class="dc-rating-num">${score.toFixed(1)}</span>
      <button type="button" class="top-card__likes" data-action="barbershop-like"
              aria-label="Curtir barbearia" title="Curtir barbearia">
        <span class="tcl-ico">👍</span><span class="dc-count">${likes}</span>
      </button>`;

    info.appendChild(nome);
    info.appendChild(starsRow);
    // Endereço abaixo das estrelas (conforme solicitado)
    info.appendChild(sub);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    // Canto superior direito: badge + favorito com confetes
    if (b?.id) {
      const actions = document.createElement('div');
      actions.className = 'top-card__actions';

      const badge = document.createElement('span');
      badge.className   = b.is_open ? 'dc-badge dc-badge--open' : 'dc-badge dc-badge--closed';
      badge.textContent = b.is_open ? 'Aberto' : 'Fechado';
      actions.appendChild(badge);

      actions.appendChild(BarbershopService.criarBotaoFavoritoCard(b.id));
      row.appendChild(actions);
    }

    return row;
  }
}

