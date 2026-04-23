'use strict';

// =============================================================
// DestaquesPage.js — Tela "Top Barbearias" do app profissional.
// Exibe todas as barbearias ativas ordenadas por rating_score desc
// (pontuação de curtidas) e rating_avg desc (desempate).
//
// Mesma lógica do app cliente — compartilha repositório e serviço.
// Dependências: BarbershopRepository.js, BarbershopService.js,
//               SupabaseService.js
// =============================================================

class DestaquesPage {

  #telaEl   = null;
  #listaEl  = null;
  #vazioEl  = null;
  #carregou = false;  // evita re-fetch na mesma sessão
  #dig      = null;   // instância DigText da descrição

  constructor() {}

  bind() {
    this.#telaEl  = document.getElementById('tela-destaques');
    this.#listaEl = document.getElementById('destaques-lista');
    this.#vazioEl = document.getElementById('destaques-vazio');
    if (!this.#telaEl) return;

    // Animação dig na descrição
    const digEl = document.getElementById('destaques-dig');
    if (digEl) {
      this.#dig = new DigText(digEl, [
        'Explore as barbearias mais bem avaliadas no BarberFlow. Ordenadas por pontuação e número de cortes, as mais populares oferecem o melhor serviço, enquanto as menos avaliadas mostram novas opões. Encontre a sua favorita e agende já o seu corte.'
      ], { velocidade: 20 });
    }

    // Carrega e anima quando a tela fica ativa
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) {
        if (!this.#carregou) this.#carregar();
        this.#dig?.iniciar();
      } else {
        this.#dig?.parar();
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  async #carregar() {
    this.#carregou = true;
    this.#listaEl.innerHTML = this.#skeleton(8);

    try {
      // Pre-carrega favoritos do usuário (cache, idempotente)
      try { await BarbershopService.carregarFavoritos(); } catch { /* silencioso */ }

      const lista = await BarbershopRepository.getTopRated(50);

      if (!lista.length) {
        this.#listaEl.innerHTML = '';
        if (this.#vazioEl) this.#vazioEl.hidden = false;
        return;
      }

      this.#listaEl.innerHTML = '';
      const cards = [];
      lista.forEach((b, i) => {
        const card = this.#criarCard(b, i);
        this.#listaEl.appendChild(card);
        cards.push(card);
      });

      // Restaura estado visual de like/dislike/favorito do usuário logado
      BarbershopService.restaurarInteracoes(cards);

    } catch (err) {
      LoggerService.error('[DestaquesPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbearias.</p>';
    }
  }

  #criarCard(b, posicao) {
    const likes    = Number(b.likes_count    ?? 0);
    const dislikes = Number(b.dislikes_count ?? 0);
    const score = b.rating_score != null
      ? Number(b.rating_score)
      : BarbershopService.calcRatingScore(likes, dislikes) || Number(b.rating_avg ?? 0);

    // Card wrapper
    const card = document.createElement('div');
    card.className = 'top-card';
    card.dataset.barbershopId = b.id;
    card.dataset.likes    = likes;
    card.dataset.dislikes = dislikes;

    // ── Posição / ranking ──────────────────────────────────
    const rank = document.createElement('div');
    rank.className = `top-card__rank${posicao < 3 ? ' top-card__rank--podio' : ''}`;
    rank.textContent = `#${posicao + 1}`;

    // ── Avatar ────────────────────────────────────────────
    const avatar = document.createElement('div');
    avatar.className = 'top-card__avatar';
    if (b.logo_path) {
      const img = document.createElement('img');
      img.alt = b.name;
      img.loading = 'lazy';
      img.onerror = () => { avatar.textContent = '💈'; };
      img.src = SupabaseService.getLogoUrl(b.logo_path) || '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = '💈';
    }

    // ── Info central ─────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'top-card__info';

    const nome = document.createElement('p');
    nome.className = 'top-card__nome';
    nome.textContent = b.name;
    if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nome, b.font_key);

    const addr = document.createElement('p');
    addr.className = 'top-card__addr';
    addr.textContent = b.address || b.city || '';

    // Estrelas
    const starsWrap = document.createElement('div');
    starsWrap.className = 'top-card__stars';
    starsWrap.innerHTML = `
      ${BarbershopService.criarEstrelasHTML(score)}
      <span class="dc-rating-num">${score.toFixed(1)}</span>
      <button type="button" class="top-card__likes" data-action="barbershop-like"
              aria-label="Curtir barbearia" title="Curtir barbearia">
        <span class="tcl-ico">👍</span><span class="dc-count">${likes}</span>
      </button>`;

    info.appendChild(nome);
    info.appendChild(addr);
    info.appendChild(starsWrap);

    // ── Badge + botão favorito (coluna no canto superior direito) ──
    const actions = document.createElement('div');
    actions.className = 'top-card__actions';

    const badge = document.createElement('span');
    badge.className = b.is_open ? 'dc-badge dc-badge--open' : 'dc-badge dc-badge--closed';
    badge.textContent = b.is_open ? 'Aberto' : 'Fechado';
    actions.appendChild(badge);

    if (b?.id) {
      actions.appendChild(BarbershopService.criarBotaoFavoritoCard(b.id));
    }

    card.appendChild(rank);
    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(actions);

    if (typeof CapaBarbearia !== 'undefined') CapaBarbearia.aplicarCapa(card, b.cover_path);
    return card;
  }

  #skeleton(n) {
    return Array(n).fill(0).map(() => `
      <div class="top-card top-card--skel">
        <div class="dc-skel" style="width:28px;height:22px;border-radius:6px;flex-shrink:0;"></div>
        <div class="top-card__avatar dc-skel"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
          <div class="dc-skel" style="width:70%;height:13px;"></div>
          <div class="dc-skel" style="width:50%;height:11px;"></div>
          <div class="dc-skel" style="width:80px;height:12px;"></div>
        </div>
      </div>`).join('');
  }
}
