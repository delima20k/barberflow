'use strict';

// =============================================================
// CapaBarbearia.js — Centraliza toda a lógica visual de capa e
//                    criação de fav-cards de barbearia.
//
// Responsabilidades:
//  • Aplicar cover_path como background-image em qualquer card.
//  • Aplicar logo_path como fallback de fundo (sem a classe capa).
//  • Criar fav-cards padronizados (DRY — usado em FavoritesPage e
//    ParceriasPage sem duplicação de código).
//
// Dependências: SupabaseService.js
// =============================================================

class CapaBarbearia {

  // ─────────────────────────────────────────────────────────
  // CONSTANTES PRIVADAS
  // ─────────────────────────────────────────────────────────

  static #CLASSE_CAPA  = 'barber-card--com-capa';
  static #CLASSE_LOGO  = 'barber-card--com-logo';

  // ─────────────────────────────────────────────────────────
  // Aplica cover_path como background-image em `el`.
  // Adiciona .barber-card--com-capa para ativar os estilos CSS.
  //
  // @param {HTMLElement} el
  // @param {string|null} coverPath — caminho no Supabase Storage
  // ─────────────────────────────────────────────────────────
  static aplicarCapa(el, coverPath) {
    if (!el || !coverPath) return;
    const url = SupabaseService.getLogoUrl(coverPath);
    if (!url) return;
    el.style.backgroundImage = `url('${url}')`;
    el.classList.add(CapaBarbearia.#CLASSE_CAPA);
  }

  // ─────────────────────────────────────────────────────────
  // Aplica logo_path como fundo simples (fallback sem overlay).
  // Usado quando há logo mas não há capa.
  //
  // @param {HTMLElement} el
  // @param {string|null} logoPath
  // ─────────────────────────────────────────────────────────
  static aplicarLogo(el, logoPath) {
    if (!el || !logoPath) return;
    const url = SupabaseService.getLogoUrl(logoPath);
    if (!url) return;
    el.style.backgroundImage    = `url('${url}')`;
    el.classList.add(CapaBarbearia.#CLASSE_LOGO);
  }

  // ─────────────────────────────────────────────────────────
  // Cria um fav-card (350×220) para uma barbearia.
  // Método centralizado — elimina duplicação entre FavoritesPage
  // e ParceriasPage.
  //
  // @param {object} b                  — dados da barbearia
  // @param {object} [opts]
  // @param {string} [opts.textoAberto='Aberto']   — badge de aberto
  // @param {string} [opts.textoFechado='Fechado'] — badge de fechado
  // @returns {HTMLDivElement}
  // ─────────────────────────────────────────────────────────
  static criarFavCard(b, { textoAberto = 'Aberto', textoFechado = 'Fechado' } = {}) {
    const temImagem = !!(b.cover_path || b.logo_path);
    const r         = Math.round(Number(b.rating_avg ?? 0));
    const stars     = '★'.repeat(r) + '☆'.repeat(5 - r);
    const aberto    = b.is_open;

    const card = document.createElement('div');
    card.className  = 'fav-card' + (temImagem ? '' : ' fav-card--sem-img');
    card.dataset.id = b.id;
    card.innerHTML  = `
      <div class="fav-card__overlay">
        <div class="fav-card__badge-row">
          <span class="badge${aberto ? '' : ' closed'}">${aberto ? textoAberto : textoFechado}</span>
          <span class="fav-card__stars">${stars}</span>
        </div>
        <p class="fav-card__nome">${b.name ?? ''}</p>
        <p class="fav-card__addr">${b.address ?? ''}</p>
      </div>`;

    if (b.cover_path) {
      CapaBarbearia.aplicarCapa(card, b.cover_path);
    } else if (b.logo_path) {
      CapaBarbearia.aplicarLogo(card, b.logo_path);
    }

    return card;
  }

  // ─────────────────────────────────────────────────────────
  // Remove capa/logo e classes de um elemento (útil em re-renders).
  //
  // @param {HTMLElement} el
  // ─────────────────────────────────────────────────────────
  static removerCapa(el) {
    if (!el) return;
    el.style.backgroundImage = '';
    el.classList.remove(CapaBarbearia.#CLASSE_CAPA, CapaBarbearia.#CLASSE_LOGO);
  }
}
