'use strict';

/**
 * MenuService — SRP: responsável EXCLUSIVAMENTE pelo menu drawer hamburguer.
 *
 * Gerencia: abrir, fechar, toggle e navegar a partir do menu.
 *
 * API pública:
 *   MenuService.abrir()
 *   MenuService.fechar()
 *   MenuService.toggle()
 *   MenuService.navDoMenu(tela, navFn)   — navFn = callback de navegação (ex: tela => App.nav(tela))
 */
const MenuService = (() => {
  'use strict';

  function abrir() {
    document.getElementById('menu-drawer')?.classList.add('aberto');
    document.getElementById('menu-overlay')?.classList.add('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.add('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu-fechado.png';
  }

  function fechar() {
    document.getElementById('menu-drawer')?.classList.remove('aberto');
    document.getElementById('menu-overlay')?.classList.remove('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.remove('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu.png';
  }

  function toggle() {
    const drawer = document.getElementById('menu-drawer');
    if (!drawer) return;
    drawer.classList.contains('aberto') ? fechar() : abrir();
  }

  /**
   * Fecha o drawer e navega para a tela indicada após a transição CSS concluir.
   *
   * Lê a duração real da transição via getComputedStyle — garante sincronismo
   * sem depender de `transitionend` (não confiável em browsers mobile).
   *
   * @param {string}   tela  — ID sem prefixo "tela-"
   * @param {Function} navFn — callback de navegação recebido do Router (ex: tela => App.nav(tela))
   */
  function navDoMenu(tela, navFn) {
    const drawer = document.getElementById('menu-drawer');

    if (!drawer || !drawer.classList.contains('aberto')) {
      navFn(tela);
      return;
    }

    const durStr = getComputedStyle(drawer).transitionDuration.split(',')[0];
    const durMs  = Math.round(parseFloat(durStr) * 1000) + 32; // +1 frame extra

    fechar();
    setTimeout(() => navFn(tela), durMs);
  }

  return Object.freeze({ abrir, fechar, toggle, navDoMenu });
})();
