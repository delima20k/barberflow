'use strict';

// =============================================================
// BarbeiroCard.js — Componente visual do card de um barbeiro.
//
// Responsabilidade ÚNICA: renderizar avatar + nome + badge "Dono".
// SRP: apenas UI — sem lógica de negócio, sem eventos, sem estado.
//
// Reutilizável em BarbeariaPage (pública) e qualquer tela futura.
//
// Dependências: SupabaseService.js (resolveAvatarUrl)
// =============================================================

class BarbeiroCard {

  /**
   * Cria o elemento DOM do card de um barbeiro.
   * @param {object}      opts
   * @param {string}      opts.nome
   * @param {string|null} opts.avatarPath
   * @param {string|null} [opts.updatedAt]
   * @param {boolean}     [opts.isOwner=false]
   * @returns {HTMLDivElement}
   */
  static criar({ nome, avatarPath, updatedAt = null, isOwner = false }) {
    const card = document.createElement('div');
    card.className = `bbc-card${isOwner ? ' bbc-card--owner' : ''}`;

    card.appendChild(BarbeiroCard.#criarAvatar(nome, avatarPath, updatedAt));

    const nomeEl       = document.createElement('p');
    nomeEl.className   = 'bbc-nome';
    nomeEl.textContent = nome;
    card.appendChild(nomeEl);

    if (isOwner) {
      const tag       = document.createElement('span');
      tag.className   = 'bbc-owner-tag';
      tag.textContent = 'Dono';
      card.appendChild(tag);
    }

    return card;
  }

  /**
   * Gera um card skeleton para exibição enquanto dados carregam.
   * @returns {HTMLDivElement}
   */
  static criarSkeleton() {
    const card = document.createElement('div');
    card.className = 'bbc-card bbc-card--skel';
    card.setAttribute('aria-hidden', 'true');

    const avatar = document.createElement('div');
    avatar.className = 'bbc-avatar';
    card.appendChild(avatar);

    const nomeSkel = document.createElement('div');
    nomeSkel.className = 'bbc-nome-skel';
    card.appendChild(nomeSkel);

    return card;
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Cria o avatar circular. Fallback para emoji 💈 se sem foto.
   * @param {string}      nome
   * @param {string|null} avatarPath
   * @param {string|null} updatedAt
   * @returns {HTMLDivElement}
   */
  static #criarAvatar(nome, avatarPath, updatedAt) {
    const wrap = document.createElement('div');
    wrap.className = 'bbc-avatar';

    if (avatarPath) {
      const img   = document.createElement('img');
      img.alt     = nome;
      img.loading = 'lazy';
      img.src     = (typeof SupabaseService !== 'undefined')
        ? SupabaseService.resolveAvatarUrl(avatarPath, updatedAt) || ''
        : '';
      img.onerror = () => { wrap.textContent = '💈'; };
      wrap.appendChild(img);
    } else {
      wrap.textContent = '💈';
    }

    return wrap;
  }
}
