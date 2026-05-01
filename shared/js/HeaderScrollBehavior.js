'use strict';

// =============================================================
// HeaderScrollBehavior.js — Ocultar/exibir header ao rolar
// Compartilhado entre app cliente e app profissional
//
// Comportamento:
//   - Ao rolar a tela-inicio para BAIXO: quando o topo de
//     .stories-scroll chegar a 5px (ou menos) abaixo do
//     header, o header sobe com animação (oculta).
//   - Ao rolar para CIMA: o header desce de volta com animação.
//
// Uso:
//   HeaderScrollBehavior.init();   // chamar no AppBootstrap
// =============================================================

class HeaderScrollBehavior {

  // ── Configuração ──────────────────────────────────────────
  static #THRESHOLD_PX = 5;        // distância (px) para disparar ocultação

  // ── Estado ────────────────────────────────────────────────
  static #header       = null;
  static #storiesScroll = null;
  static #tela         = null;
  static #oculto       = false;
  static #ultimoScroll = 0;

  // ── API pública ───────────────────────────────────────────

  static init() {
    HeaderScrollBehavior.#header        = document.getElementById('app-header');
    HeaderScrollBehavior.#storiesScroll = document.querySelector('.stories-scroll');
    HeaderScrollBehavior.#tela          = document.getElementById('tela-inicio');

    if (!HeaderScrollBehavior.#header || !HeaderScrollBehavior.#tela) return;

    HeaderScrollBehavior.#ultimoScroll = HeaderScrollBehavior.#tela.scrollTop;
    HeaderScrollBehavior.#tela.addEventListener(
      'scroll',
      () => HeaderScrollBehavior.#aoRolar(),
      { passive: true }
    );
  }

  // ── Privados ──────────────────────────────────────────────

  static #aoRolar() {
    const scrollAtual    = HeaderScrollBehavior.#tela.scrollTop;
    const rolando_baixo  = scrollAtual > HeaderScrollBehavior.#ultimoScroll;
    HeaderScrollBehavior.#ultimoScroll = scrollAtual;

    if (rolando_baixo) {
      HeaderScrollBehavior.#verificarOcultar();
    } else {
      HeaderScrollBehavior.#exibir();
    }
  }

  static #verificarOcultar() {
    if (HeaderScrollBehavior.#oculto) return;
    if (!HeaderScrollBehavior.#storiesScroll) {
      // sem .stories-scroll: oculta direto ao rolar para baixo
      HeaderScrollBehavior.#ocultar();
      return;
    }
    const headerBaixo  = HeaderScrollBehavior.#header.getBoundingClientRect().bottom;
    const storiesTop   = HeaderScrollBehavior.#storiesScroll.getBoundingClientRect().top;
    if (storiesTop - headerBaixo <= HeaderScrollBehavior.#THRESHOLD_PX) {
      HeaderScrollBehavior.#ocultar();
    }
  }

  static #ocultar() {
    HeaderScrollBehavior.#oculto = true;
    HeaderScrollBehavior.#header.classList.add('header--oculto');
  }

  static #exibir() {
    if (!HeaderScrollBehavior.#oculto) return;
    HeaderScrollBehavior.#oculto = false;
    HeaderScrollBehavior.#header.classList.remove('header--oculto');
  }
}
