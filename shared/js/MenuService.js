'use strict';

/**
 * MenuService — SRP: responsável EXCLUSIVAMENTE pelo menu drawer hamburguer.
 *
 * Gerencia: abrir, fechar, toggle e navegar a partir do menu.
 *
 * API pública:
 *   MenuService.abrir()
 *   MenuService.fechar()             — fecha para a ESQUERDA (gesto do usuário)
 *   MenuService.fecharParaDireita()  — fecha para a DIREITA (quando navegação dispara com menu aberto)
 *   MenuService.toggle()
 *   MenuService.navDoMenu(tela, navFn)   — navFn = callback de navegação (ex: tela => App.nav(tela))
 */
const MenuService = (() => {
  'use strict';

  // ── helpers privados ─────────────────────────────────────────

  /** Reverte o estado visual do botão/ícone e oculta o overlay. */
  function _limparEstadoUI() {
    document.getElementById('menu-overlay')?.classList.remove('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.remove('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu.png';
  }

  // ── API pública ──────────────────────────────────────────────

  function abrir() {
    document.getElementById('menu-drawer')?.classList.add('aberto');
    document.getElementById('menu-overlay')?.classList.add('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.add('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu-fechado.png';
  }

  /** Fecha para a ESQUERDA — gesto manual do usuário. */
  function fechar() {
    document.getElementById('menu-drawer')?.classList.remove('aberto');
    _limparEstadoUI();
  }

  /**
   * Fecha para a DIREITA — quando a navegação de página é disparada com o menu aberto,
   * sincronizando visualmente com a animação das telas.
   * É um no-op se o menu não estiver aberto.
   */
  function fecharParaDireita() {
    const drawer = document.getElementById('menu-drawer');
    if (!drawer?.classList.contains('aberto')) return;

    _limparEstadoUI();

    drawer.classList.remove('aberto');
    drawer.classList.add('saindo-direita');

    // Após a transição: reposiciona sem animar (pronto para o próximo abrir)
    const durMs = Math.round(parseFloat(getComputedStyle(drawer).transitionDuration) * 1000) + 32;
    setTimeout(() => {
      drawer.style.transition = 'none';
      drawer.classList.remove('saindo-direita');
      void drawer.offsetHeight; // força reflow para aplicar posição sem animar
      drawer.style.transition = '';
    }, durMs);
  }

  function toggle() {
    const drawer = document.getElementById('menu-drawer');
    if (!drawer) return;
    drawer.classList.contains('aberto') ? fechar() : abrir();
  }

  /**
   * Delega a navegação ao callback do Router.
   * O fechamento (para a direita) é responsabilidade do Router.nav() / push(),
   * que chamam fecharParaDireita() automaticamente.
   * @param {string}   tela
   * @param {Function} navFn
   */
  function navDoMenu(tela, navFn) {
    navFn(tela);
  }

  return Object.freeze({ abrir, fechar, fecharParaDireita, toggle, navDoMenu });
})();
