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

      if (!lista.length) {
        this.#listaEl.innerHTML = '';
        if (this.#vazioEl) this.#vazioEl.hidden = false;
        return;
      }

      this.#listaEl.innerHTML = '';
      lista.forEach(b => this.#listaEl.appendChild(this.#criarCard(b)));

    } catch (err) {
      console.error('[BarbeariasPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbearias.</p>';
    }
  }

  #criarCard(b) {
    const row = document.createElement('div');
    row.className = 'barber-row barber-card';

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

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = b.city ? `${b.address ? b.address + ' — ' : ''}${b.city}` : (b.address || 'Barbearia');

    info.appendChild(nome);
    info.appendChild(sub);

    // Meta (rating + badge aberto/fechado)
    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    if (b.rating_avg) {
      const rating = document.createElement('span');
      rating.className   = 'badge';
      rating.textContent = `★ ${Number(b.rating_avg).toFixed(1)}`;
      meta.appendChild(rating);
    }

    const statusBadge = document.createElement('span');
    statusBadge.className   = `badge ${b.is_open ? 'badge-open' : 'badge-closed'}`;
    statusBadge.textContent = b.is_open ? 'Aberto' : 'Fechado';
    meta.appendChild(statusBadge);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    return row;
  }

  #skeleton(n) {
    return Array(n).fill(0).map(() => `
      <div class="barber-row barber-card" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:130px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
          <p class="barber-sub"  style="width:90px;height:11px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');
  }
}
