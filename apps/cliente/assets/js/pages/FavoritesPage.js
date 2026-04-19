'use strict';

// =============================================================
// FavoritesPage.js — Página de Barbearias Favoritas do app cliente.
// Responsabilidade: carregar e renderizar a lista de favoritos do
// usuário autenticado usando o ProfileRepository.
// A navegação para pesquisa via data-nav é tratada pelo Router.
//
// Dependências: ProfileRepository.js, AuthService.js, AppState.js
// =============================================================

// Gerencia a tela de favoritas: carrega e exibe favoritos do usuário logado.
class FavoritesPage {

  #listaEl    = null;  // container dinâmico dentro da tela
  #telaEl     = null;  // #tela-favoritas
  #jaCarregou = false; // evita re-fetch redundante na mesma sessão

  constructor() {}

  /**
   * Registra observer para carregar favoritos quando a tela ficar ativa.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    this.#telaEl  = document.getElementById('tela-favoritas');
    this.#listaEl = document.getElementById('favoritas-lista');
    if (!this.#telaEl) return;

    // Recarrega quando a tela entra em foco
    new MutationObserver(() => {
      if (this.#telaEl.classList.contains('ativa')) {
        this.#carregar();
      } else {
        this.#jaCarregou = false; // permite re-fetch na próxima entrada
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privado ──────────────────────────────────────────────

  async #carregar() {
    if (this.#jaCarregou) return;

    const perfil = AppState.get('perfil');
    if (!perfil?.id) return; // não logado — exibe estado vazio padrão

    this.#jaCarregou = true;

    try {
      const lista = await ProfileRepository.getFavorites(perfil.id);
      this.#renderLista(lista);
    } catch (e) {
      console.warn('[FavoritesPage] Erro ao carregar favoritos:', e?.message);
    }
  }

  #renderLista(lista) {
    if (!this.#listaEl) return;
    if (!lista.length) { this.#listaEl.innerHTML = ''; return; }

    this.#listaEl.innerHTML = '';
    lista.forEach(b => {
      const row = document.createElement('div');
      row.className = 'barber-row';

      const avatar = document.createElement('div');
      avatar.className = 'avatar gold';
      avatar.textContent = '💈';

      const info = document.createElement('div');
      info.className = 'barber-info';

      const nome = document.createElement('p');
      nome.className   = 'barber-name';
      nome.textContent = b.name;

      const sub = document.createElement('p');
      sub.className   = 'barber-sub';
      sub.textContent = b.address ?? '';

      const stars = document.createElement('div');
      stars.className   = 'stars';
      const r = Number(b.rating_avg ?? 0);
      stars.textContent = '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

      info.appendChild(nome);
      info.appendChild(sub);
      info.appendChild(stars);

      const meta = document.createElement('div');
      meta.className = 'barber-meta';

      const badge = document.createElement('span');
      badge.className   = b.is_open ? 'badge' : 'badge closed';
      badge.textContent = b.is_open ? 'Aberto' : 'Fechado';

      const btn = document.createElement('button');
      btn.className        = 'btn btn-gold btn-sm';
      btn.textContent      = 'Agendar';
      btn.dataset.action   = 'agendar';

      meta.appendChild(badge);
      meta.appendChild(btn);

      row.appendChild(avatar);
      row.appendChild(info);
      row.appendChild(meta);

      this.#listaEl.appendChild(row);
    });
  }
}
