'use strict';

// =============================================================
// LogoGlow.js — Aplica efeito de luz dourada radial (POO)
// O mesmo efeito do .menu-logo aplicado dinamicamente em:
//   - .app-icon  (telas de login/cadastro/esqueceu)
//   - .story-shop-badge (badge nos stories)
// =============================================================

class LogoGlow {

  // Seletores e a classe wrapper correspondente
  static #ALVOS = [
    { selector: '.app-icon',         wrap: 'logo-glow-wrap' },
    { selector: '.story-shop-badge', wrap: 'logo-glow-wrap logo-glow-wrap--badge' },
  ];

  /**
   * Percorre todos os alvos dentro de `root` e envolve cada imagem
   * numa div com a classe de glow, se ainda não tiver sido aplicado.
   * @param {Document|HTMLElement} root — escopo da busca (padrão: document)
   */
  static aplicar(root = document) {
    LogoGlow.#ALVOS.forEach(({ selector, wrap }) => {
      root.querySelectorAll(selector).forEach(img => {
        // Já foi aplicado? ignora
        if (img.parentElement?.classList.contains('logo-glow-wrap')) return;

        const div = document.createElement('div');
        div.className = wrap;
        img.parentNode.insertBefore(div, img);
        div.appendChild(img);
      });
    });
  }

  /** Ponto de entrada autoático para DOMContentLoaded. */
  static boot() {
    LogoGlow.aplicar();
  }
}

/* Ponto de entrada — método da própria classe, sem código solto */
document.addEventListener('DOMContentLoaded', () => LogoGlow.boot());
