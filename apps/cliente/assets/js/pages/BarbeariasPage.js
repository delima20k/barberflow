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
      lista.forEach(b => this.#listaEl.appendChild(this.#criarCard(b)));

    } catch (err) {
      LoggerService.error('[BarbeariasPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbearias.</p>';
    }
  }

  #criarCard(b) {
    const row = document.createElement('div');
    row.className = 'barber-row barber-card';
    if (b?.id) row.dataset.barbershopId = b.id;

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

    // Info
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = b.name || 'Barbearia';

    info.appendChild(nome);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    // Top-right padronizado: badge (Aberto/Fechado) em cima + cta-row (stars + favorito) embaixo
    if (b?.id) {
      const actions = document.createElement('div');
      actions.className = 'card-top-actions';

      const badge = document.createElement('span');
      badge.className   = b.is_open ? 'badge' : 'badge closed';
      badge.textContent = b.is_open ? 'Aberto' : 'Fechado';
      actions.appendChild(badge);

      const ctaRow = document.createElement('div');
      ctaRow.className = 'cta-row';

      const stars = document.createElement('span');
      stars.className   = 'stars';
      stars.textContent = `★ ${Number(b.rating_avg ?? 0).toFixed(1)}`;
      ctaRow.appendChild(stars);

      ctaRow.appendChild(BarbershopService.criarBotaoFavoritoCard(b.id));
      actions.appendChild(ctaRow);

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
