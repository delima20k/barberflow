'use strict';

// =============================================================
// BarbeirosPage.js — Tela "Barbeiros Populares" do app cliente.
// Exibe todos os barbeiros profissionais cadastrados.
//
// Dependências: BarbershopRepository.js, SupabaseService.js
// =============================================================

class BarbeirosPage {

  #telaEl   = null;
  #listaEl  = null;
  #vazioEl  = null;
  #carregou = false;
  #dig      = null;   // instância DigText

  constructor() {}

  bind() {
    this.#telaEl  = document.getElementById('tela-barbeiros');
    this.#listaEl = document.getElementById('barbeiros-lista');
    this.#vazioEl = document.getElementById('barbeiros-vazio');
    if (!this.#telaEl) return;

    // Animação dig no subtítulo
    const digEl = document.getElementById('barbeiros-dig');
    if (digEl) {
      this.#dig = new DigText(digEl, [
        'Profissionais verificados, avaliados pela comunidade BarberFlow.'
      ], { velocidade: 28 });
    }

    // Carrega na primeira vez que a tela fica ativa
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) {
        if (!this.#carregou) {
          this.#carregar();
        } else {
          // Recarrega apenas as interações (sem refetch da lista)
          this.#restaurarInteracoes();
        }
        this.#dig?.iniciar();
      } else {
        this.#dig?.parar();
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privado ──────────────────────────────────────────────

  // Sets em memória — carregados do banco ao entrar na tela
  #liked = new Set();
  #faved = new Set();

  async #restaurarInteracoes() {
    const perfil = typeof AppState !== 'undefined' ? AppState.get('perfil') : null;
    if (!perfil?.id) return;
    try {
      const [likes, favs] = await Promise.all([
        ProfileRepository.getUserProfessionalLikes(perfil.id),
        ProfileRepository.getUserProfessionalFavs(perfil.id),
      ]);
      this.#liked = likes;
      this.#faved = favs;

      // Atualiza visual dos botões já renderizados
      this.#listaEl?.querySelectorAll('.barber-row[data-pro-id]').forEach(row => {
        const id = row.dataset.proId;
        const btnL = row.querySelector('.bc-btn-like');
        const btnF = row.querySelector('.bc-btn-fav');
        if (btnL) {
          btnL.classList.toggle('bc-btn--ativo', likes.has(id));
          const ico = btnL.querySelector('.bc-ico');
          if (ico) ico.textContent = likes.has(id) ? '❤️' : '🤍';
        }
        if (btnF) {
          btnF.classList.toggle('bc-btn--ativo', favs.has(id));
          const ico = btnF.querySelector('.bc-ico');
          if (ico) ico.textContent = favs.has(id) ? '⭐' : '☆';
        }
      });
    } catch (e) {
      LoggerService.warn('[BarbeirosPage] restaurarInteracoes:', e?.message);
    }
  }

  async #carregar() {    this.#carregou = true;
    this.#listaEl.innerHTML = this.#skeleton(6);

    try {
      // Carrega interações do usuário logado em paralelo com a lista
      const perfil = typeof AppState !== 'undefined' ? AppState.get('perfil') : null;
      const [lista, likes, favs] = await Promise.all([
        BarbershopRepository.getBarbers(100),
        perfil?.id ? ProfileRepository.getUserProfessionalLikes(perfil.id).catch(() => new Set()) : Promise.resolve(new Set()),
        perfil?.id ? ProfileRepository.getUserProfessionalFavs(perfil.id).catch(() => new Set())  : Promise.resolve(new Set()),
      ]);

      this.#liked = likes;
      this.#faved = favs;

      if (!lista.length) {
        this.#listaEl.innerHTML = '';
        if (this.#vazioEl) this.#vazioEl.hidden = false;
        return;
      }

      this.#listaEl.innerHTML = '';
      lista.forEach(p => this.#listaEl.appendChild(this.#criarCard(p)));

    } catch (err) {
      LoggerService.error('[BarbeirosPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbeiros.</p>';
    }
  }

  // ── Interações (banco + UI) ──────────────────────────────

  async #toggleLike(id, btn) {
    const perfil = typeof AppState !== 'undefined' ? AppState.get('perfil') : null;
    const cntEl  = btn.querySelector('.bc-cnt');
    const icoEl  = btn.querySelector('.bc-ico');
    const count  = parseInt(cntEl?.textContent || '0', 10);

    const eraLike = this.#liked.has(id);

    // Feedback imediato
    if (eraLike) {
      this.#liked.delete(id);
      btn.classList.remove('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '🤍';
      if (cntEl) cntEl.textContent = Math.max(0, count - 1);
    } else {
      this.#liked.add(id);
      btn.classList.add('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '❤️';
      if (cntEl) cntEl.textContent = count + 1;
    }

    // Persiste no banco (silencioso se não logado)
    if (!perfil?.id) return;
    try {
      await ProfileRepository.toggleProfessionalLike(perfil.id, id);
    } catch (e) {
      LoggerService.warn('[BarbeirosPage] toggleLike falhou:', e?.message);
    }
  }

  async #toggleFav(id, btn) {
    const perfil = typeof AppState !== 'undefined' ? AppState.get('perfil') : null;
    const router = typeof App !== 'undefined' ? App : null;
    if (!perfil?.id) {
      if (typeof AuthGuard !== 'undefined') AuthGuard.permitirAcao('favoritar', router);
      return;
    }
    const icoEl  = btn.querySelector('.bc-ico');
    const eraFav = this.#faved.has(id);

    // Feedback imediato
    if (eraFav) {
      this.#faved.delete(id);
      btn.classList.remove('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '☆';
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Você desfavoritou este Barbeiro', '', NotificationService.TIPOS.SISTEMA);
      }
    } else {
      this.#faved.add(id);
      btn.classList.add('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '⭐';
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Você favoritou este Barbeiro ⭐', '', NotificationService.TIPOS.SISTEMA);
      }
    }

    // Persiste no banco
    try {
      await ProfileRepository.toggleFavoriteBarber(perfil.id, id);
    } catch (e) {
      LoggerService.warn('[BarbeirosPage] toggleFav falhou:', e?.message);
    }
  }

  #renderStars(avg) {
    const full  = Math.round(avg);
    const empty = 5 - full;
    return '★'.repeat(Math.max(0, full)) + '☆'.repeat(Math.max(0, empty));
  }

  #criarCard(p) {
    const isLiked = this.#liked.has(p.id);
    const isFaved = this.#faved.has(p.id);
    const ratingAvg   = parseFloat(p.rating_avg  || 0);
    const ratingCount = parseInt(p.rating_count  || 0, 10);

    const row = document.createElement('div');
    row.className    = 'barber-row barber-card';
    row.dataset.proId = p.id;

    // ── Avatar ──────────────────────────────────────────────
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (p.avatar_path) {
      const img = document.createElement('img');
      img.alt     = p.full_name || 'Barbeiro';
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      img.src = SupabaseService.getAvatarUrl(p.avatar_path) || '';
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    // ── Info ─────────────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = p.full_name || 'Barbeiro';

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = 'Barbeiro Profissional';

    const ratingEl = document.createElement('div');
    ratingEl.className = 'bc-rating';
    ratingEl.innerHTML =
      `<span class="bc-stars">${this.#renderStars(ratingAvg)}</span>` +
      `<span class="bc-rating-val">${ratingAvg > 0 ? ratingAvg.toFixed(1) : '—'}</span>` +
      (ratingCount > 0 ? `<span class="bc-rating-cnt">(${ratingCount})</span>` : '');

    info.appendChild(nome);
    info.appendChild(sub);
    info.appendChild(ratingEl);

    // ── Ações (curtir + favoritar) ────────────────────────────
    const acoes = document.createElement('div');
    acoes.className = 'bc-acoes';

    const btnLike = document.createElement('button');
    btnLike.className = 'bc-btn-like' + (isLiked ? ' bc-btn--ativo' : '');
    btnLike.setAttribute('aria-label', 'Curtir barbeiro');
    btnLike.type = 'button';
    btnLike.innerHTML =
      `<span class="bc-ico">${isLiked ? '❤️' : '🤍'}</span>` +
      `<span class="bc-cnt">${ratingCount}</span>`;
    btnLike.addEventListener('click', (e) => { e.stopPropagation(); this.#toggleLike(p.id, btnLike); });

    const btnFav = document.createElement('button');
    btnFav.className = 'bc-btn-fav' + (isFaved ? ' bc-btn--ativo' : '');
    btnFav.setAttribute('aria-label', 'Favoritar barbeiro');
    btnFav.type = 'button';
    btnFav.innerHTML = `<span class="bc-ico">${isFaved ? '⭐' : '☆'}</span>`;
    btnFav.addEventListener('click', (e) => { e.stopPropagation(); this.#toggleFav(p.id, btnFav); });

    acoes.appendChild(btnLike);
    acoes.appendChild(btnFav);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(acoes);
    return row;
  }

  #skeleton(n) {
    return Array(n).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:110px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
          <p class="barber-sub"  style="width:70px;height:11px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');
  }
}
