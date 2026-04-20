'use strict';

// =============================================================
// FavoritesPage.js — Tela de Favoritas do app cliente.
// Seção 1: Barbearias favoritas — carrossel de cards 350×220.
// Seção 2: Barbeiros favoritos   — lista barber-row.
//
// Dependências: ProfileRepository, SupabaseService, AppState,
//               AuthService, LoggerService
// =============================================================

class FavoritesPage {

  #telaEl         = null;  // #tela-favoritas
  #barbeariasEl   = null;  // #favoritas-barbearias (carrossel)
  #barbeirosEl    = null;  // #favoritas-barbeiros  (lista)
  #jaCarregou     = false;
  #dig            = null;  // instância DigText

  constructor() {}

  /** Chame uma vez após o DOM estar disponível. */
  bind() {
    this.#telaEl       = document.getElementById('tela-favoritas');
    this.#barbeariasEl = document.getElementById('favoritas-barbearias');
    this.#barbeirosEl  = document.getElementById('favoritas-barbeiros');
    if (!this.#telaEl) return;

    const digEl = document.getElementById('favoritas-dig');
    if (digEl) {
      this.#dig = new DigText(digEl, [
        'Suas barbearias e barbeiros favoritos em um só lugar.',
        'Acesse rápido e agende com 1 toque.',
        'Favoritos sincronizados com sua conta.',
      ], { velocidade: 32 });
    }

    new MutationObserver(() => {
      if (this.#telaEl.classList.contains('ativa')) {
        this.#carregar();
        this.#dig?.iniciar();
      } else {
        this.#jaCarregou = false;
        this.#dig?.parar();
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privado ───────────────────────────────────────────────

  async #carregar() {
    if (this.#jaCarregou) return;

    // Tenta pegar userId do AppState; fallback via Supabase para race-condition
    // (sessão restaurada antes de AppState.perfil ser populado)
    let userId = AppState.get('perfil')?.id;

    if (!userId && AppState.get('isLogado')) {
      try {
        const u = await SupabaseService.getUser?.();
        userId = u?.id ?? null;
      } catch (_) { /* sem rede ou sem sessão */ }
    }

    if (!userId) {
      this.#renderVazioBarbearias();
      this.#renderVazioBarbeiros();
      return;
    }

    this.#jaCarregou = true;

    const [barbearias, barbeiros] = await Promise.allSettled([
      ProfileRepository.getFavorites(userId),
      ProfileRepository.getFavoriteBarbers(userId),
    ]);

    if (barbearias.status === 'fulfilled') {
      this.#renderBarbearias(barbearias.value);
    } else {
      LoggerService.warn('[FavoritesPage] barbearias:', barbearias.reason?.message);
      this.#renderVazioBarbearias();
    }

    if (barbeiros.status === 'fulfilled') {
      this.#renderBarbeiros(barbeiros.value);
    } else {
      LoggerService.warn('[FavoritesPage] barbeiros:', barbeiros.reason?.message);
      this.#renderVazioBarbeiros();
    }
  }

  // ── Barbearias ────────────────────────────────────────────

  #renderBarbearias(lista) {
    if (!this.#barbeariasEl) return;
    if (!lista.length) { this.#renderVazioBarbearias(); return; }

    this.#barbeariasEl.innerHTML = '';
    lista.forEach(b => this.#barbeariasEl.appendChild(this.#criarFavCard(b)));
  }

  #renderVazioBarbearias() {
    if (!this.#barbeariasEl) return;
    this.#barbeariasEl.innerHTML = `
      <div class="fav-card fav-card--sem-img" style="display:flex;align-items:center;justify-content:center;">
        <div class="fav-card__overlay" style="align-items:center;justify-content:center;gap:8px;">
          <span style="font-size:2rem;">💈</span>
          <p style="color:rgba(255,255,255,.6);font-size:.8rem;text-align:center;">
            Nenhuma barbearia favorita<br>
            <button class="fav-card__btn" style="margin-top:8px;" data-nav="pesquisa">Explorar</button>
          </p>
        </div>
      </div>`;
  }

  /** Cria um card 350×220 para uma barbearia. */
  #criarFavCard(b) {
    const card = document.createElement('div');
    card.className = 'fav-card' + (b.logo_path ? '' : ' fav-card--sem-img');
    card.dataset.id = b.id;

    const r     = Math.round(Number(b.rating_avg ?? 0));
    const stars = '★'.repeat(r) + '☆'.repeat(5 - r);
    const aberto = b.is_open;

    card.innerHTML = `
      ${b.logo_path ? `<img class="fav-card__img" src="${b.logo_path}" alt="${b.name}" loading="lazy">` : ''}
      <div class="fav-card__overlay">
        <div class="fav-card__badge-row">
          <span class="badge${aberto ? '' : ' closed'}">${aberto ? 'Aberto' : 'Fechado'}</span>
          <span class="fav-card__stars">${stars}</span>
        </div>
        <p class="fav-card__nome">${b.name ?? ''}</p>
        <p class="fav-card__addr">${b.address ?? ''}</p>
        <div class="fav-card__footer">
          <span></span>
          <button class="fav-card__btn" data-action="agendar" data-barbershop="${b.id}">Agendar</button>
        </div>
      </div>`;

    return card;
  }

  // ── Barbeiros ─────────────────────────────────────────────

  #renderBarbeiros(lista) {
    if (!this.#barbeirosEl) return;
    if (!lista.length) { this.#renderVazioBarbeiros(); return; }

    this.#barbeirosEl.innerHTML = '';
    lista.forEach(p => this.#barbeirosEl.appendChild(this.#criarBarbeiroRow(p)));
  }

  #renderVazioBarbeiros() {
    if (!this.#barbeirosEl) return;
    this.#barbeirosEl.innerHTML = `
      <div class="barber-row" style="opacity:.55;pointer-events:none;">
        <div class="avatar gold">✂️</div>
        <div class="barber-info">
          <p class="barber-name">Nenhum barbeiro favorito</p>
          <p class="barber-sub">Favorite barbeiros durante o agendamento</p>
        </div>
      </div>`;
  }

  /** Cria um barber-row para um profissional favorito. */
  #criarBarbeiroRow(p) {
    const perfil  = p.profiles ?? {};
    const nome    = perfil.full_name ?? 'Barbeiro';
    const avatar  = perfil.avatar_url ?? p.avatar_path ?? '/shared/img/icones-perfil.png';
    const r       = Math.round(Number(p.rating_avg ?? 0));
    const stars   = '★'.repeat(r) + '☆'.repeat(5 - r);
    const specs   = (p.specialties ?? []).slice(0, 2).join(' · ');

    const row = document.createElement('div');
    row.className   = 'barber-row';
    row.dataset.id  = p.id;

    row.innerHTML = `
      <div class="avatar gold">
        <img src="${avatar}" alt="${nome}" onerror="this.outerHTML='✂️'" loading="lazy">
      </div>
      <div class="barber-info">
        <p class="barber-name">${nome}</p>
        ${specs ? `<p class="barber-sub">${specs}</p>` : ''}
        <div class="stars" style="margin-top:3px;">${stars}</div>
      </div>
      <div class="barber-meta">
        <button class="btn btn-gold btn-sm" data-action="agendar" data-professional="${p.id}">Agendar</button>
      </div>`;

    return row;
  }
}
