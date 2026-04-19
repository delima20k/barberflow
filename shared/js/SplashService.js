'use strict';

/**
 * SplashService — SRP: responsável EXCLUSIVAMENTE pela transição entre apps.
 *
 * Monta um overlay com BarberPole, exibe por ~2.2s e redireciona.
 * O guard interno `_navegando` evita múltiplas execuções simultâneas.
 *
 * API pública:
 *   SplashService.navegar(url)           — detecta tipo e exibe splash + redireciona
 *   SplashService.exibir(tipo, onFim)    — exibe splash apenas (sem redirecionar)
 */
const SplashService = (() => {
  'use strict';

  let _navegando = false;

  /**
   * Monta o overlay splash com BarberPole.
   * @param {'PROFISSIONAL'|'CLIENTE'} tipo
   * @param {Function|null} [onFim] — callback após fade-out
   */
  function exibir(tipo, onFim = null) {
    if (document.querySelector('.splash-overlay')) return;

    const bv = tipo === 'PROFISSIONAL'
      ? { linha1: 'Bem-vindo,', linha2: 'BarberFlow PROFISSIONAL' }
      : { linha1: 'Bem-vindo ao', linha2: 'BarberFlow CLIENTE' };

    const overlay = document.createElement('div');
    overlay.className = 'splash-overlay';
    overlay.innerHTML = `
      <img class="splash-logo-nome" src="/shared/img/LogoNomeBarberFlow.png" alt="BarberFlow">
      <p class="splash-app">${bv.linha1} <strong>${bv.linha2}</strong></p>
      <div class="splash-polo-wrap"><div id="splash-polo"></div></div>
    `;
    document.body.appendChild(overlay);

    if (typeof BarberPole !== 'undefined') {
      new BarberPole(overlay.querySelector('#splash-polo'));
    }

    setTimeout(() => {
      overlay.classList.add('saindo');
      setTimeout(() => { onFim ? onFim() : overlay.remove(); }, 450);
    }, 2200);
  }

  /**
   * Detecta o app destino pelo URL, exibe splash e redireciona.
   * URL com 'cliente' → CLIENTE; qualquer outro → PROFISSIONAL.
   * @param {string} url — caminho destino (ex: '../profissional/' ou URL absoluta)
   */
  function navegar(url) {
    if (_navegando) return;
    _navegando = true;

    const tipo = url.toLowerCase().includes('cliente') ? 'CLIENTE' : 'PROFISSIONAL';
    const sep  = url.includes('?') ? '&' : '?';
    const dest = `${url}${sep}t=${Date.now()}`;

    exibir(tipo, () => {
      window.location.replace(dest);
      // guard será resetado pela navegação — sem necessidade de reset manual
    });
  }

  return Object.freeze({ navegar, exibir });
})();
