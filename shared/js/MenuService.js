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

  /**
   * Fecha o menu deslizando para a DIREITA — usado quando a navegação de página
   * é disparada com o menu aberto, sincronizando visualmente com a animação das telas.
   * É um no-op se o menu não estiver aberto.
   */
  function fecharParaDireita() {
    const drawer = document.getElementById('menu-drawer');
    if (!drawer || !drawer.classList.contains('aberto')) return;

    // Oculta overlay e restaura estado do botão imediatamente
    document.getElementById('menu-overlay')?.classList.remove('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.remove('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu.png';

    // Anima saída para a direita
    drawer.classList.remove('aberto');
    drawer.classList.add('saindo-direita');

    // Após a transição: reposiciona para a esquerda sem animar (pronto para o próximo abrir)
    const durStr = getComputedStyle(drawer).transitionDuration.split(',')[0];
    const durMs  = Math.round(parseFloat(durStr) * 1000) + 32;
    setTimeout(() => {
      drawer.style.transition = 'none';
      drawer.classList.remove('saindo-direita');
      drawer.offsetHeight; // força reflow para aplicar posição instantaneamente
      drawer.style.transition = '';
    }, durMs);
  }

  function toggle() {
    const drawer = document.getElementById('menu-drawer');
    if (!drawer) return;
    drawer.classList.contains('aberto') ? fechar() : abrir();
  }

  /**
   * Delega a navegação ao callback recebido do Router.
   * O fechamento do menu (para a direita) é responsabilidade do Router.nav() / Router.push(),
   * que chamam fecharParaDireita() automaticamente quando o menu está aberto.
   *
   * @param {string}   tela  — ID sem prefixo "tela-"
   * @param {Function} navFn — callback de navegação recebido do Router (ex: tela => App.nav(tela))
   */
  function navDoMenu(tela, navFn) {
    navFn(tela);
  }

  return Object.freeze({ abrir, fechar, fecharParaDireita, toggle, navDoMenu });
})();
