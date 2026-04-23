'use strict';

// =============================================================
// BarbeariasPage.js — Tela "Populares e mais Próximas".
// Exibe lista completa de barbearias ordenadas por avaliação.
//
// Dependências: BarbershopRepository.js, SupabaseService.js
// =============================================================

class BarbeariasPage {

  #telaEl   = null;
  #listaEl  = null;
  #vazioEl  = null;
  #carregou = false;
  #dig      = null;   // instância DigText

  constructor() {}

  bind() {
    this.#telaEl  = document.getElementById('tela-barbearias');
    this.#listaEl = document.getElementById('barbearias-page-lista');
    this.#vazioEl = document.getElementById('barbearias-page-vazio');
    if (!this.#telaEl) return;

    // Animação dig no subtítulo
    const digEl = document.getElementById('barbearias-dig');
    if (digEl) {
      this.#dig = new DigText(digEl, [
        'As barbearias mais bem avaliadas e próximas de você, reunidas em um só lugar.'
      ], { velocidade: 28 });
    }

    // Carrega na primeira vez que a tela fica ativa
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

  // ── Privado ──────────────────────────────────────────────

  async #carregar() {
    this.#carregou = true;
    this.#listaEl.innerHTML = this.#skeleton(6);

    try {
      const lista = await BarbershopRepository.getAll(100);

      // Carrega favoritos em cache antes de renderizar (idempotente)
      try { await BarbershopService.carregarFavoritos(); } catch { /* silencioso */ }

      if (!lista.length) {
        this.#listaEl.innerHTML = '';
        if (this.#vazioEl) this.#vazioEl.hidden = false;
        return;
      }

      this.#listaEl.innerHTML = '';
      const cards = [];
      lista.forEach(b => {
        const card = this.#criarCard(b);
        this.#listaEl.appendChild(card);
        cards.push(card);
      });

      // Restaura estado visual de like/dislike/favorito do usuário logado
      BarbershopService.restaurarInteracoes(cards);

    } catch (err) {
      LoggerService.error('[BarbeariasPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbearias.</p>';
    }
  }

  #criarCard(b) {
    const ratingAvg = Number(b.rating_avg ?? 0);

    const row = document.createElement('div');
    row.className = 'barber-row barber-card';
    if (b?.id) row.dataset.barbershopId = b.id;
    row.dataset.likes    = Number(b.likes_count    ?? 0);
    row.dataset.dislikes = Number(b.dislikes_count ?? 0);

    // Avatar / logo
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img = document.createElement('img');
      img.alt     = b.name || 'Barbearia';
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      img.src = SupabaseService.getLogoUrl(b.logo_path) || '';
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    // Info: nome + estrelas (padrão top-card__stars)
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = b.name || 'Barbearia';
    if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nome, b.font_key);

    const likes    = Number(b.likes_count    ?? 0);
    const starsRow = document.createElement('div');
    starsRow.className = 'top-card__stars';
    starsRow.innerHTML = `
      ${BarbershopService.criarEstrelasHTML(ratingAvg)}
      <span class="dc-rating-num">${ratingAvg.toFixed(1)}</span>
      <button type="button" class="top-card__likes" data-action="barbershop-like"
              aria-label="Curtir barbearia" title="Curtir barbearia">
        <span class="tcl-ico">👍</span><span class="dc-count">${likes}</span>
      </button>`;

    info.appendChild(nome);
    info.appendChild(starsRow);

    // Endereço — obrigatório em todos os cards de barbearia
    const addr = document.createElement('p');
    addr.className   = 'barber-addr';
    addr.textContent = b.address || b.city ? `📍 ${b.address || b.city}` : '';
    info.appendChild(addr);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    // Canto superior direito: badge (Aberto/Fechado) + favorito com confetes
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

  #skeleton(n) {
    return Array(n).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:130px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
        </div>
      </div>`).join('');
  }
}
