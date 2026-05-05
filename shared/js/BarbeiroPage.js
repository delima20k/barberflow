'use strict';

// =============================================================
// BarbeiroPage.js — Perfil público de um barbeiro/profissional
//
// Responsabilidades:
//   - Exibir avatar, nome, badge de "Dono do salão", rating e bio
//   - Pré-renderiza na tela oculta ANTES da animação de entrada
//     (máx. 600 ms de espera — fallback para skeleton em rede lenta)
//   - Navegação SPA via router.nav('barbeiro')
//   - Listener global: intercepta cliques em [data-barber-id]
//
// Dependências: BarbershopRepository.js, ApiService.js, SupabaseService.js,
//               CacheManager.js, InputValidator.js, LoggerService.js,
//               NavigationManager.js
// =============================================================

class BarbeiroPage {

  // ── Estado ────────────────────────────────────────────────
  #telaEl    = null;
  #barberoId = null;   // UUID do barbeiro atual
  #isOwner   = false;  // true se for o dono do salão

  // ── Refs DOM ──────────────────────────────────────────────
  #refs = {};

  constructor() {}

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

  /** Liga a tela e registra os listeners. Chamar uma vez após o DOM pronto. */
  bind() {
    this.#telaEl = document.getElementById('tela-barbeiro');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#bindListenerGlobal();
  }

  /**
   * Abre o perfil do barbeiro identificado por `id`.
   *
   * Fluxo (pre-render antes da animação):
   *   1. Verifica cache → se hit: renderiza imediatamente na tela oculta
   *   2. Se miss: inicia fetch + aguarda máx. 600 ms (Promise.race com timeout)
   *   3. Se dados chegaram a tempo: renderiza na tela oculta
   *   4. ENTÃO navega — tela entra JÁ com conteúdo pronto
   *   5. Se rede lenta (>600 ms): navega com skeleton; MutationObserver termina
   *
   * @param {string}  id      — UUID do barbeiro
   * @param {boolean} isOwner — true se o barbeiro é dono do salão
   */
  async abrirPorId(id, isOwner = false) {
    if (!InputValidator.uuid(id).ok) return;

    this.#barberoId = id;
    this.#isOwner   = isOwner;

    this.#limparConteudo();
    this.#mostrarSkeleton();

    // Fast path síncrono: cache já populado
    let profile = CacheManager.get(`${id}:barbeiro`);

    if (!profile) {
      // Inicia fetch + aguarda máx. 600 ms (não bloqueia além disso)
      const fetchPromise = BarbeiroPage.#fetchPerfil(id);
      profile = await Promise.race([
        fetchPromise,
        new Promise(r => setTimeout(() => r(null), 600)),
      ]);
      if (profile) CacheManager.set(`${id}:barbeiro`, profile, 5 * 60 * 1000);
    }

    // Renderiza na tela oculta se os dados chegaram e o contexto não mudou
    if (profile && this.#barberoId === id) {
      this.#renderizar(profile);
    }

    // Navega: tela entra com conteúdo ou skeleton
    const router = (typeof App !== 'undefined' && App)
                || (typeof Pro !== 'undefined' && Pro)
                || null;
    NavigationManager.navigate(() => { if (router) router.nav('barbeiro'); });
  }

  // ══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════

  #cacheRefs() {
    const q = sel => this.#telaEl.querySelector(sel);
    this.#refs = {
      skeleton:   q('#beiro-skeleton'),
      conteudo:   q('#beiro-conteudo'),
      avatarWrap: q('#beiro-avatar-wrap'),
      avatar:     q('#beiro-avatar'),       // <img> dentro do avatarWrap (pode não existir)
      nome:       q('#beiro-nome'),
      badge:      q('#beiro-badge'),
      rating:     q('#beiro-rating'),
      bio:        q('#beiro-bio'),
      favBtn:     q('#beiro-fav-btn'),
      likeBtn:    q('#beiro-like-btn'),
    };
  }

  /**
   * Listener global: intercepta cliques em qualquer [data-barber-id].
   * `data-barber-owner="true"` indica que o barbeiro é o dono do salão.
   * Usa capture (terceiro arg = true) para agir antes de outros listeners.
   */
  #bindListenerGlobal() {
    document.addEventListener('click', e => {
      const card = e.target.closest('[data-barber-id]');
      if (!card || e.target.closest('[data-action]')) return;

      const id = card.dataset.barberId;
      if (!InputValidator.uuid(id).ok) return;

      const isOwner = card.dataset.barberOwner === 'true';
      e.stopPropagation();
      this.abrirPorId(id, isOwner);
    }, true);
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════

  #renderizar(profile) {
    this.#renderAvatar(profile);
    this.#renderNome(profile);
    this.#renderBadge();
    this.#renderRating(profile);
    this.#renderBio(profile);
    this.#renderFavBtn(profile);
    this.#renderLikeBtn(profile);
    this.#mostrarConteudo();
  }

  #renderAvatar(profile) {
    const wrap = this.#refs.avatarWrap;
    if (!wrap) return;

    if (profile.avatar_path) {
      const url = SupabaseService.resolveAvatarUrl(profile.avatar_path, profile.updated_at) ?? '';
      // Reutiliza <img> existente ou cria um novo
      let img = wrap.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.id = 'beiro-avatar';
        img.addEventListener('error', () => { wrap.textContent = '💈'; });
        wrap.innerHTML = '';
        wrap.appendChild(img);
        this.#refs.avatar = img;
      }
      img.src = url;
      img.alt = profile.full_name ?? '';
      img.dataset.barberId = profile.id ?? '';
    } else {
      // Sem avatar: emoji fallback
      wrap.textContent = '💈';
    }
  }

  #renderNome(profile) {
    if (this.#refs.nome) {
      this.#refs.nome.textContent = profile.full_name ?? 'Barbeiro';
    }
  }

  #renderBadge() {
    if (!this.#refs.badge) return;
    if (this.#isOwner) {
      this.#refs.badge.textContent = 'Dono do salão';
      this.#refs.badge.hidden = false;
    } else {
      this.#refs.badge.textContent = '';
      this.#refs.badge.hidden = true;
    }
  }

  #renderRating(profile) {
    if (!this.#refs.rating) return;
    const count = Number(profile.rating_count ?? 0);
    const avg   = Number(profile.rating_avg   ?? 0).toFixed(1);
    this.#refs.rating.textContent = count > 0
      ? `⭐ ${avg}  (${count} cortes)`
      : 'Novo barbeiro';
  }

  #renderBio(profile) {
    if (!this.#refs.bio) return;
    if (profile.bio) {
      this.#refs.bio.textContent = profile.bio;
      this.#refs.bio.hidden = false;
    } else {
      this.#refs.bio.textContent = '';
      this.#refs.bio.hidden = true;
    }
  }

  /** Atualiza estado do botão de favoritar na página de detalhe. */
  #renderFavBtn(profile) {
    const btn = this.#refs.favBtn;
    if (!btn || !profile?.id) return;
    // O botão fica no topbar (fora de [data-professional-id]); o ID vai direto nele
    // para que btn.closest('[data-professional-id]') funcione na delegação
    btn.dataset.professionalId = profile.id;
    const ativo = typeof ProfessionalService !== 'undefined'
      ? ProfessionalService.isFavorito(profile.id)
      : false;
    btn.classList.toggle('ativo', ativo);
    const ico = btn.querySelector('.cfb-ico');
    if (ico) ico.textContent = ativo ? '⭐' : '☆';
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
  }

  /** Atualiza estado do botão de curtida na página de detalhe. */
  #renderLikeBtn(profile) {
    const btn = this.#refs.likeBtn;
    if (!btn || !profile?.id) return;
    btn.dataset.professionalId = profile.id;
    const count = Number(profile.rating_count ?? 0);
    const ativo = typeof ProfessionalService !== 'undefined'
      ? ProfessionalService.isCurtido(profile.id)
      : false;
    btn.classList.toggle('ativo', ativo);
    const cnt = btn.querySelector('.dc-count');
    if (cnt) cnt.textContent = Math.max(0, count);
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = ativo ? 'Remover curtida' : 'Curtir barbeiro';
  }

  // ══════════════════════════════════════════════════════════
  // FETCHER (estático — sem acesso a this)
  // ══════════════════════════════════════════════════════════

  /**
   * Busca o perfil público do barbeiro por ID.
   * Delega ao BarbershopRepository (única fonte de verdade para profiles_public).
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  static async #fetchPerfil(id) {
    try {
      return await BarbershopRepository.getBarberById(id);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[BarbeiroPage] erro ao buscar perfil:', err?.message ?? err);
      }
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════
  // CONTROLE DE VISIBILIDADE
  // ══════════════════════════════════════════════════════════

  #limparConteudo() {
    if (this.#refs.avatarWrap) { this.#refs.avatarWrap.textContent = '💈'; }
    if (this.#refs.nome)       { this.#refs.nome.textContent    = ''; }
    if (this.#refs.badge)      { this.#refs.badge.textContent   = ''; this.#refs.badge.hidden = true; }
    if (this.#refs.rating)     { this.#refs.rating.textContent  = ''; }
    if (this.#refs.bio)        { this.#refs.bio.textContent     = ''; this.#refs.bio.hidden = true; }
    if (this.#refs.favBtn) {
      this.#refs.favBtn.dataset.professionalId = '';
      this.#refs.favBtn.classList.remove('ativo');
      const ico = this.#refs.favBtn.querySelector('.cfb-ico');
      if (ico) ico.textContent = '☆';
      this.#refs.favBtn.setAttribute('aria-pressed', 'false');
      this.#refs.favBtn.title = 'Adicionar aos favoritos';
      this.#refs.favBtn.disabled = false;
      this.#refs.favBtn.removeAttribute('aria-disabled');
    }
    if (this.#refs.likeBtn) {
      this.#refs.likeBtn.dataset.professionalId = '';
      this.#refs.likeBtn.classList.remove('ativo');
      const cnt = this.#refs.likeBtn.querySelector('.dc-count');
      if (cnt) cnt.textContent = '0';
      this.#refs.likeBtn.setAttribute('aria-pressed', 'false');
      this.#refs.likeBtn.title = 'Curtir barbeiro';
    }
  }

  #mostrarSkeleton() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = false;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = true;
  }

  #mostrarConteudo() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = false;
  }
}
