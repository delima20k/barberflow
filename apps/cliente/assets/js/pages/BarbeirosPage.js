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
  #carregou = false;  // evita re-fetch na mesma sessão

  constructor() {}

  bind() {
    this.#telaEl  = document.getElementById('tela-barbeiros');
    this.#listaEl = document.getElementById('barbeiros-lista');
    this.#vazioEl = document.getElementById('barbeiros-vazio');
    if (!this.#telaEl) return;

    // Carrega na primeira vez que a tela fica ativa
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa && !this.#carregou) this.#carregar();
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
      console.error('[BarbeirosPage] erro ao carregar:', err);
      this.#listaEl.innerHTML = '<p style="color:#e07070;text-align:center;padding:20px;">Erro ao carregar barbeiros.</p>';
    }
  }

  #criarCard(p) {
    const row = document.createElement('div');
    row.className = 'barber-row barber-card';

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

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = p.full_name || 'Barbeiro';

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = 'Barbeiro Profissional';

    info.appendChild(nome);
    info.appendChild(sub);

    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const badge = document.createElement('span');
    badge.className   = 'badge';
    badge.textContent = 'Barbeiro';

    meta.appendChild(badge);

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
          <p class="barber-name" style="width:110px;height:14px;background:var(--card-alt,#f0e8df);border-radius:6px"></p>
          <p class="barber-sub"  style="width:70px;height:11px;background:var(--card-alt,#f0e8df);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');
  }
}
