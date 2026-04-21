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
      lista.forEach(p => this.#listaEl.appendChild(this.#criarCard(p)));

    } catch (err) {
      LoggerService.error('[BarbeirosPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbeiros.</p>';
    }
  }

  #criarCard(p) {
    const ratingCount = parseInt(p.rating_count || 0, 10);

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

    // ── Info ─────────────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = p.full_name || 'Barbeiro';

    info.appendChild(nome);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    // ── Top-right padronizado: cta-row (stars + like + favorito) ──
    const actions = document.createElement('div');
    actions.className = 'card-top-actions';

    const ctaRow = document.createElement('div');
    ctaRow.className = 'cta-row';

    const starsEl = document.createElement('span');
    starsEl.className = 'stars';
    starsEl.innerHTML =
      `<span class="bc-stars">${ProfessionalService.renderStars(ratingCount)}</span>` +
      `<span class="bc-rating-val" style="margin-left:4px">${ProfessionalService.estrelasPorCurtidas(ratingCount).toFixed(1)}</span>` +
      (ratingCount > 0 ? `<span class="bc-rating-cnt" style="margin-left:2px">(${ratingCount})</span>` : '');
    ctaRow.appendChild(starsEl);

    ctaRow.appendChild(ProfessionalService.criarBotaoLike(p.id, ratingCount));
    ctaRow.appendChild(ProfessionalService.criarBotaoFavorito(p.id));

    actions.appendChild(ctaRow);
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
