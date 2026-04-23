'use strict';

// =============================================================
// ParceriasPage.js — Tela "Parcerias" do app profissional.
//
// Exclusiva para barbeiros autônomos (pro_type='barbeiro').
// Seção 1: Barbearias Parceiras   — lista barbearias do sistema
// Seção 2: Convites Recebidos      — convites de barbearias para trabalhar
// Seção 3: Favoritos               — barbearias e barbeiros favoritados
//                                    pelo barbeiro profissional
//                                    (reutiliza ProfileRepository, mesma
//                                    lógica da FavoritesPage do cliente)
//
// Dependências: ProfileRepository, BarbershopRepository, SupabaseService,
//               AuthService, AppState, LoggerService, NotificationService
// =============================================================

class ParceriasPage {

  // ── Refs DOM ──────────────────────────────────────────────
  #telaEl          = null;

  // Seção 1 — Barbearias Parceiras
  #parceirasListaEl = null;

  // Seção 2 — Convites
  #convitesListaEl  = null;
  #convitesVazioEl  = null;

  // Seção 3 — Favoritos
  #favBarbeariasEl  = null;
  #favBarbeirosEl   = null;

  // ── Estado ───────────────────────────────────────────────
  #carregouParceiras = false;
  #carregouConvites  = false;
  #carregouFavoritos = false;

  constructor() {}

  /** Chame uma vez após o DOM estar disponível. */
  bind() {
    this.#telaEl = document.getElementById('tela-parcerias');
    if (!this.#telaEl) return;

    this.#parceirasListaEl = document.getElementById('parcerias-barbearias-lista');
    this.#convitesListaEl  = document.getElementById('parcerias-convites-lista');
    this.#convitesVazioEl  = document.getElementById('parcerias-convites-vazio');
    this.#favBarbeariasEl  = document.getElementById('parcerias-fav-barbearias');
    this.#favBarbeirosEl   = document.getElementById('parcerias-fav-barbeiros');

    // Botão "Ver meus favoritos" — colapsa/expande a seção
    document.getElementById('parcerias-fav-toggle')
      ?.addEventListener('click', () => this.#toggleFavoritos());

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#aoEntrar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ═══════════════════════════════════════════════════════════
  // ENTRADA NA TELA
  // ═══════════════════════════════════════════════════════════

  async #aoEntrar() {
    // Carrega em paralelo, cada seção independentemente
    if (!this.#carregouParceiras) this.#carregarParceiras();
    if (!this.#carregouConvites)  this.#carregarConvites();
    // Favoritos são carregados ao expandir a seção (lazy)
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 1 — BARBEARIAS PARCEIRAS
  // ═══════════════════════════════════════════════════════════

  async #carregarParceiras() {
    this.#carregouParceiras = true;
    if (!this.#parceirasListaEl) return;

    this.#parceirasListaEl.innerHTML = this.#skeletonParceiras(4);

    try {
      const lista = await BarbershopRepository.getAll(20);
      this.#parceirasListaEl.innerHTML = '';

      if (!lista.length) {
        this.#parceirasListaEl.innerHTML = ParceriasPage.#vazioHtml(
          '💈', 'Nenhuma barbearia parceira ainda'
        );
        return;
      }

      lista.forEach(b => this.#parceirasListaEl.appendChild(this.#criarCardParceira(b)));

    } catch (err) {
      LoggerService.error('[ParceriasPage] parceiras:', err);
      this.#parceirasListaEl.innerHTML = ParceriasPage.#erroHtml('barbearias parceiras');
    }
  }

  #criarCardParceira(b) {
    const row = document.createElement('div');
    row.className   = 'parcerias-row';
    row.dataset.id  = b.id;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img = document.createElement('img');
      img.src     = SupabaseService.getLogoUrl(b.logo_path) || '';
      img.alt     = b.name || 'Barbearia';
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = b.name || 'Barbearia';
    if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nome, b.font_key);

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = b.address || (b.city || 'BarberFlow');

    const badge = document.createElement('span');
    badge.className   = `badge ${b.is_open ? 'badge-open' : 'badge-closed'}`;
    badge.textContent = b.is_open ? 'Aberta' : 'Fechada';

    info.appendChild(nome);
    info.appendChild(sub);
    info.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const btnAgendar = document.createElement('button');
    btnAgendar.className       = 'btn btn-gold btn-sm';
    btnAgendar.textContent     = 'Atividade';
    btnAgendar.dataset.action  = 'atividade';
    btnAgendar.dataset.tela    = 'producao-parceira';  // caminho preparado: tela a ser construída
    btnAgendar.dataset.barbershop = b.id;
    meta.appendChild(btnAgendar);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    if (typeof CapaBarbearia !== 'undefined') CapaBarbearia.aplicarCapa(row, b.cover_path);
    return row;
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 2 — CONVITES DE BARBEARIAS
  // ═══════════════════════════════════════════════════════════

  async #carregarConvites() {
    this.#carregouConvites = true;
    if (!this.#convitesListaEl) return;

    const perfil = AuthService.getPerfil?.();
    if (!perfil?.id) {
      this.#convitesListaEl.innerHTML = ParceriasPage.#vazioHtml(
        '📩', 'Faça login para ver seus convites'
      );
      return;
    }

    this.#convitesListaEl.innerHTML = this.#skeletonConvite(2);

    try {
      const { data, error } = await SupabaseService.client
        .from('barbershop_invites')
        .select(`
          id, message, commission_pct, status, created_at,
          barbershop:barbershops!barbershop_id ( id, name, logo_path, address )
        `)
        .eq('barbeiro_id', perfil.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      this.#convitesListaEl.innerHTML = '';

      if (!data?.length) {
        if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = false;
        return;
      }

      if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = true;
      data.forEach(inv => this.#convitesListaEl.appendChild(this.#criarCardConvite(inv)));

    } catch (err) {
      // Tabela pode não existir ainda (migration pendente) — exibe vazio silencioso
      LoggerService.warn('[ParceriasPage] convites:', err?.message);
      this.#convitesListaEl.innerHTML = '';
      if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = false;
    }
  }

  #criarCardConvite(inv) {
    const card = document.createElement('div');
    card.className   = `parcerias-convite-card parcerias-convite--${inv.status ?? 'pendente'}`;
    card.dataset.id  = inv.id;

    const shop   = inv.barbershop ?? {};
    const pct    = inv.commission_pct != null ? `${inv.commission_pct}%` : '—';
    const status = inv.status ?? 'pendente';
    const data   = inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('pt-BR')
      : '';

    const statusLabel = { pendente: 'Pendente', aceito: 'Aceito', recusado: 'Recusado' };

    card.innerHTML = `
      <div class="parcerias-convite-header">
        <div class="avatar gold" style="width:38px;height:38px;font-size:.9rem;">
          ${shop.logo_path
            ? `<img src="${SupabaseService.getLogoUrl(shop.logo_path)}" alt="${shop.name}" loading="lazy" onerror="this.outerHTML='💈'">`
            : '💈'}
        </div>
        <div class="parcerias-convite-info">
          <p class="barber-name">${shop.name ?? 'Barbearia'}</p>
          <p class="barber-sub">${shop.address ?? ''}</p>
        </div>
        <span class="parcerias-convite-status parcerias-convite-status--${status}">
          ${statusLabel[status] ?? status}
        </span>
      </div>
      ${inv.message ? `<p class="parcerias-convite-msg">"${inv.message}"</p>` : ''}
      <div class="parcerias-convite-clausulas">
        <span class="parcerias-convite-pct">Comissão: <strong>${pct}</strong></span>
        ${data ? `<span class="parcerias-convite-data">${data}</span>` : ''}
      </div>
      ${status === 'pendente' ? `
      <div class="parcerias-convite-acoes">
        <button class="btn btn-gold btn-sm" data-convite-aceitar="${inv.id}">Aceitar</button>
        <button class="btn btn-outline btn-sm" data-convite-recusar="${inv.id}">Recusar</button>
      </div>` : ''}`;

    // Delegação de eventos — aceitar / recusar
    card.querySelector(`[data-convite-aceitar="${inv.id}"]`)
      ?.addEventListener('click', () => this.#responderConvite(inv.id, 'aceito', card));
    card.querySelector(`[data-convite-recusar="${inv.id}"]`)
      ?.addEventListener('click', () => this.#responderConvite(inv.id, 'recusado', card));

    return card;
  }

  async #responderConvite(inviteId, novoStatus, cardEl) {
    try {
      const { error } = await SupabaseService.client
        .from('barbershop_invites')
        .update({ status: novoStatus })
        .eq('id', inviteId);

      if (error) throw error;

      // Atualiza card sem re-render
      cardEl.classList.remove('parcerias-convite--pendente');
      cardEl.classList.add(`parcerias-convite--${novoStatus}`);
      cardEl.querySelector('.parcerias-convite-status').textContent =
        novoStatus === 'aceito' ? 'Aceito' : 'Recusado';
      cardEl.querySelector('.parcerias-convite-acoes')?.remove();

      const msg = novoStatus === 'aceito' ? 'Convite aceito! 🎉' : 'Convite recusado.';
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(msg, '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
      }
    } catch (err) {
      LoggerService.error('[ParceriasPage] responderConvite:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 3 — FAVORITOS (lazy — expande ao clicar)
  // ═══════════════════════════════════════════════════════════

  #favAberto = false;

  #toggleFavoritos() {
    const wrap = document.getElementById('parcerias-fav-wrap');
    const btn  = document.getElementById('parcerias-fav-toggle');
    if (!wrap) return;

    this.#favAberto = !this.#favAberto;
    wrap.hidden = !this.#favAberto;

    if (btn) {
      btn.textContent = this.#favAberto
        ? '▲ Fechar favoritos'
        : '▼ Ver meus favoritos';
    }

    if (this.#favAberto && !this.#carregouFavoritos) {
      this.#carregarFavoritos();
    }
  }

  async #carregarFavoritos() {
    this.#carregouFavoritos = true;

    let userId = AppState.get('perfil')?.id;
    if (!userId && AppState.get('isLogado')) {
      try {
        const u = await SupabaseService.getUser?.();
        userId = u?.id ?? null;
      } catch (_) { /* sem rede */ }
    }

    if (!userId) {
      this.#renderFavVazioBarbearias();
      this.#renderFavVazioBarbeiros();
      return;
    }

    const [barbearias, barbeiros] = await Promise.allSettled([
      ProfileRepository.getFavorites(userId),
      ProfileRepository.getFavoriteBarbers(userId),
    ]);

    if (barbearias.status === 'fulfilled') {
      this.#renderFavBarbearias(barbearias.value);
    } else {
      LoggerService.warn('[ParceriasPage] fav barbearias:', barbearias.reason?.message);
      this.#renderFavVazioBarbearias();
    }

    if (barbeiros.status === 'fulfilled') {
      this.#renderFavBarbeiros(barbeiros.value);
    } else {
      LoggerService.warn('[ParceriasPage] fav barbeiros:', barbeiros.reason?.message);
      this.#renderFavVazioBarbeiros();
    }
  }

  // ── Favoritos — Barbearias ───────────────────────────────

  #renderFavBarbearias(lista) {
    if (!this.#favBarbeariasEl) return;
    if (!lista.length) { this.#renderFavVazioBarbearias(); return; }

    this.#favBarbeariasEl.innerHTML = '';
    lista.forEach(b => this.#favBarbeariasEl.appendChild(this.#criarFavCard(b)));
  }

  #renderFavVazioBarbearias() {
    if (!this.#favBarbeariasEl) return;
    this.#favBarbeariasEl.innerHTML = `
      <div class="fav-card fav-card--sem-img" style="display:flex;align-items:center;justify-content:center;">
        <div class="fav-card__overlay" style="align-items:center;justify-content:center;gap:8px;">
          <span style="font-size:2rem;">💈</span>
          <p style="color:rgba(255,255,255,.6);font-size:.8rem;text-align:center;">
            Nenhuma barbearia favorita
          </p>
        </div>
      </div>`;
  }

  /** Card fav-card (350×220) para barbearia favorita — mesmo padrão de tela-favoritas. */
  #criarFavCard(b) {
    const card = document.createElement('div');
    card.className = 'fav-card' + (b.logo_path ? '' : ' fav-card--sem-img');
    card.dataset.id = b.id;

    const r     = Math.round(Number(b.rating_avg ?? 0));
    const stars = '★'.repeat(r) + '☆'.repeat(5 - r);
    const aberto = b.is_open;

    card.innerHTML = `
      ${b.logo_path ? `<img class="fav-card__img" src="${b.logo_path}" alt="${b.name ?? ''}" loading="lazy">` : ''}
      <div class="fav-card__overlay">
        <div class="fav-card__badge-row">
          <span class="badge${aberto ? '' : ' closed'}">${aberto ? 'Aberta' : 'Fechada'}</span>
          <span class="fav-card__stars">${stars}</span>
        </div>
        <p class="fav-card__nome">${b.name ?? ''}</p>
        <p class="fav-card__addr">${b.address ?? ''}</p>
      </div>`;

    return card;
  }

  // ── Favoritos — Barbeiros ────────────────────────────────

  #renderFavBarbeiros(lista) {
    if (!this.#favBarbeirosEl) return;
    if (!lista.length) { this.#renderFavVazioBarbeiros(); return; }

    this.#favBarbeirosEl.innerHTML = '';
    lista.forEach(p => this.#favBarbeirosEl.appendChild(this.#criarBarbeiroFavRow(p)));
  }

  #renderFavVazioBarbeiros() {
    if (!this.#favBarbeirosEl) return;
    this.#favBarbeirosEl.innerHTML = `
      <div class="barber-row" style="opacity:.55;pointer-events:none;">
        <div class="avatar gold">✂️</div>
        <div class="barber-info">
          <p class="barber-name">Nenhum barbeiro favorito</p>
          <p class="barber-sub">Favorite barbeiros durante o agendamento</p>
        </div>
      </div>`;
  }

  #criarBarbeiroFavRow(p) {
    const perfil = p.profiles ?? {};
    const nome   = perfil.full_name ?? 'Barbeiro';
    const path   = perfil.avatar_path ?? p.avatar_path ?? null;
    const avatar = path
      ? (SupabaseService.getAvatarUrl(path) || '/shared/img/icones-perfil.png')
      : '/shared/img/icones-perfil.png';
    const r     = Math.round(Number(p.rating_avg ?? 0));
    const stars = '★'.repeat(r) + '☆'.repeat(5 - r);
    const specs = (p.specialties ?? []).slice(0, 2).join(' · ');

    const row = document.createElement('div');
    row.className   = 'barber-row';
    row.dataset.id  = p.id;
    row.innerHTML = `
      <div class="avatar gold">
        <img src="${avatar}" alt="${nome}" loading="lazy" onerror="this.outerHTML='✂️'">
      </div>
      <div class="barber-info">
        <p class="barber-name">${nome}</p>
        ${specs ? `<p class="barber-sub">${specs}</p>` : ''}
        <div class="stars" style="margin-top:3px;">${stars}</div>
      </div>`;
    return row;
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS — Skeletons e estados vazios
  // ═══════════════════════════════════════════════════════════

  #skeletonParceiras(n) {
    return Array(n).fill(0).map(() => `
      <div class="barber-row parcerias-row" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:130px;height:14px;background:var(--card-alt);border-radius:6px"></p>
          <p class="barber-sub"  style="width:90px;height:11px;background:var(--card-alt);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');
  }

  #skeletonConvite(n) {
    return Array(n).fill(0).map(() => `
      <div class="parcerias-convite-card" style="opacity:.4;pointer-events:none;min-height:80px;
           background:var(--card);border-radius:var(--r-md);border:1px solid var(--gold-border);">
      </div>`).join('');
  }

  static #vazioHtml(emoji, msg) {
    return `<div class="parcerias-vazio"><span>${emoji}</span><p>${msg}</p></div>`;
  }

  static #erroHtml(ctx) {
    return `<p style="color:var(--danger);text-align:center;padding:20px;font-size:.85rem;">
              Erro ao carregar ${ctx}.</p>`;
  }
}
