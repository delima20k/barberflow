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
    return CapaBarbearia.criarFavCard(b);
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

  /** Cria um barber-row para um profissional favorito (mesmo padrão de BarbeirosPage). */
  #criarBarbeiroRow(p) {
    const proId    = p.id;
    const nome     = p.profiles?.full_name ?? 'Barbeiro';
    const path     = p.profiles?.avatar_path ?? p.avatar_path ?? null;
    const ratingVal = Number(p.rating_avg ?? 0);

    const row = document.createElement('div');
    row.className          = 'barber-row barber-card';
    row.dataset.professionalId = proId;
    row.dataset.barberId       = proId;

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (path) {
      const img   = document.createElement('img');
      img.alt     = nome;
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      img.src     = SupabaseService.resolveAvatarUrl(path) || '';
      avatarWrap.appendChild(img);
    } else { avatarWrap.textContent = '💈'; }

    // Info: nome + top-card__stars
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nomeEl = document.createElement('p');
    nomeEl.className   = 'barber-name';
    nomeEl.textContent = nome;
    info.appendChild(nomeEl);

    // Mesma fonte de verdade e mesmo texto/classe usados em BarbeirosPage#criarCard
    // e SearchWidget#criarProfissionalRow — não inventa uma segunda regra.
    if (p.profiles?.pro_type === 'barbearia') {
      const badge = document.createElement('span');
      badge.className   = 'barber-owner-badge';
      badge.textContent = '🏪 Tem Barbearia';
      info.appendChild(badge);
    }

    const starsRow = document.createElement('div');
    starsRow.className = 'top-card__stars';
    starsRow.innerHTML = `${BarbershopService.criarEstrelasHTML(ratingVal)}<span class="dc-rating-num">${ratingVal.toFixed(1)}</span>`;
    starsRow.appendChild(ProfessionalService.criarBotaoLike(proId, 0));
    info.appendChild(starsRow);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    // Canto superior direito: brand logo + botão favorito
    const actions = document.createElement('div');
    actions.className = 'top-card__actions card-actions-brand';

    const brand = document.createElement('div');
    brand.className = 'card-brand';
    const brandImg = document.createElement('img');
    brandImg.src       = '/shared/img/nomeAppBarber.png';
    brandImg.alt       = 'BarberFlow';
    brandImg.loading   = 'lazy';
    brandImg.className = 'card-brand-logo';
    brand.appendChild(brandImg);
    actions.appendChild(brand);

    actions.appendChild(ProfessionalService.criarBotaoFavorito(proId));
    row.appendChild(actions);

    return row;
  }
}
