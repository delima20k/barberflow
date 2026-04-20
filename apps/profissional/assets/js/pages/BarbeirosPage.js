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
      const lista = await BarbershopRepository.getBarbers(100);

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

  // ── Interações localStorage ──────────────────────────────

  #getLiked() {
    try { return new Set(JSON.parse(localStorage.getItem('bf_barber_likes') || '[]')); }
    catch { return new Set(); }
  }

  #getFaved() {
    try { return new Set(JSON.parse(localStorage.getItem('bf_barber_favs') || '[]')); }
    catch { return new Set(); }
  }

  #toggleLike(id, btn) {
    const liked = this.#getLiked();
    const cntEl = btn.querySelector('.bc-cnt');
    const icoEl = btn.querySelector('.bc-ico');
    const count = parseInt(cntEl?.textContent || '0', 10);
    if (liked.has(id)) {
      liked.delete(id);
      btn.classList.remove('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '🤍';
      if (cntEl) cntEl.textContent = Math.max(0, count - 1);
    } else {
      liked.add(id);
      btn.classList.add('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '❤️';
      if (cntEl) cntEl.textContent = count + 1;
    }
    try { localStorage.setItem('bf_barber_likes', JSON.stringify([...liked])); } catch { /* sem-op */ }
  }

  #toggleFav(id, btn) {
    const faved = this.#getFaved();
    const icoEl = btn.querySelector('.bc-ico');
    if (faved.has(id)) {
      faved.delete(id);
      btn.classList.remove('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '☆';
    } else {
      faved.add(id);
      btn.classList.add('bc-btn--ativo');
      if (icoEl) icoEl.textContent = '⭐';
    }
    try { localStorage.setItem('bf_barber_favs', JSON.stringify([...faved])); } catch { /* sem-op */ }
  }

  #renderStars(avg) {
    const full  = Math.round(avg);
    const empty = 5 - full;
    return '★'.repeat(Math.max(0, full)) + '☆'.repeat(Math.max(0, empty));
  }

  #criarCard(p) {
    const liked   = this.#getLiked();
    const faved   = this.#getFaved();
    const isLiked = liked.has(p.id);
    const isFaved = faved.has(p.id);
    const ratingAvg   = parseFloat(p.rating_avg  || 0);
    const ratingCount = parseInt(p.rating_count  || 0, 10);

    const row = document.createElement('div');
    row.className = 'barber-row barber-card';

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
