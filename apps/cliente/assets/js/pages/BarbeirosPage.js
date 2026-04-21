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

  async #restaurarInteracoes() {
    try {
      await ProfessionalService.carregarInteracoes(true);
    } catch (e) {
      LoggerService.warn('[BarbeirosPage] restaurarInteracoes:', e?.message);
    }
  }

  async #carregar() {
    this.#carregou = true;
    this.#listaEl.innerHTML = this.#skeleton(6);

    try {
      // Pre-carrega cache de interações do usuário (idempotente)
      await ProfessionalService.carregarInteracoes();
      const lista = await BarbershopRepository.getBarbers(100);

      if (!lista.length) {
        this.#listaEl.innerHTML = '';
        if (this.#vazioEl) this.#vazioEl.hidden = false;
        return;
      }

      this.#listaEl.innerHTML = '';
      const cards = [];
      lista.forEach(p => {
        const card = this.#criarCard(p);
        this.#listaEl.appendChild(card);
        cards.push(card);
      });

      // Restaura contadores reais direto de professional_likes (sem depender do trigger)
      this.#restaurarContadoresBarbeiros(cards, lista);

    } catch (err) {
      LoggerService.error('[BarbeirosPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbeiros.</p>';
    }
  }

  async #restaurarContadoresBarbeiros(cards, lista) {
    try {
      const ids = lista.map(p => p.id).filter(Boolean);
      if (!ids.length) return;
      const counts = await ProfileRepository.getProfessionalLikeCountsDirect(ids);
      cards.forEach(card => {
        const id = card.dataset.professionalId;
        if (!id || counts[id] === undefined) return;
        const total = counts[id];
        const val   = ProfessionalService.estrelasPorCurtidas(total);
        // Atualiza o botão de curtida
        const likeBtn = card.querySelector('[data-action="professional-like"]');
        if (likeBtn) {
          const cnt = likeBtn.querySelector('.dc-count');
          if (cnt) cnt.textContent = total;
        }
        // Atualiza estrelas e nota
        const numEl = card.querySelector('.dc-rating-num');
        if (numEl) numEl.textContent = val.toFixed(1);
        card.querySelectorAll('.tc-star').forEach((s, i) => {
          const pct = Math.min(100, Math.max(0, Math.round((val - i) * 100)));
          s.style.setProperty('--pct', `${pct}%`);
        });
      });
    } catch (e) {
      LoggerService.warn('[BarbeirosPage] restaurarContadoresBarbeiros:', e?.message);
    }
  }

  #criarCard(p) {
    const ratingCount = parseInt(p.rating_count || 0, 10);
    const ratingVal   = ProfessionalService.estrelasPorCurtidas(ratingCount);

    const row = document.createElement('div');
    row.className = 'barber-row barber-card';
    row.dataset.professionalId = p.id;

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

    // ── Info: nome + estrelas (padrão top-card__stars) ──────
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = p.full_name || 'Barbeiro';

    const starsRow = document.createElement('div');
    starsRow.className = 'top-card__stars';
    starsRow.innerHTML = `
      ${BarbershopService.criarEstrelasHTML(ratingVal)}
      <span class="dc-rating-num">${ratingVal.toFixed(1)}</span>`;
    starsRow.appendChild(ProfessionalService.criarBotaoLike(p.id, ratingCount));

    info.appendChild(nome);
    info.appendChild(starsRow);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    // ── Canto superior direito: apenas favorito (sem like/dislike) ──
    const actions = document.createElement('div');
    actions.className = 'top-card__actions';
    actions.appendChild(ProfessionalService.criarBotaoFavorito(p.id));
    row.appendChild(actions);

    return row;
  }

  #skeleton(n) {
    return Array(n).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:110px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
        </div>
      </div>`).join('');
  }
}
