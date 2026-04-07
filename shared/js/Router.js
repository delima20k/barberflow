'use strict';

/**
 * BarberFlow — Base SPA Router
 *
 * Classe base para navegação tipo SPA.
 * Estenda e implemente o getter `telasComNav`
 * para definir em quais telas o footer aparece.
 *
 * @abstract
 */
class Router {
  _telaAtual = '';
  _historico = [];
  _footer    = null;
  _navBtns   = [];

  /**
   * Conjunto de telas que exibem o footer de navegação.
   * @returns {Set<string>}
   */
  get telasComNav() {
    return new Set([]);
  }

  /**
   * @param {string} telaInicial — ID da tela exibida no boot (sem prefixo "tela-")
   */
  constructor(telaInicial = 'login') {
    this._footer  = document.getElementById('footer-nav');
    this._navBtns = Array.from(document.querySelectorAll('.nav-btn'));
    this._telaAtual = telaInicial;

    // Ativa a tela inicial visualmente
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    const telaEl = document.getElementById(`tela-${telaInicial}`);
    if (telaEl) telaEl.classList.add('ativa');

    this._atualizarUI(telaInicial);
  }

  /**
   * Navega para a tela indicada.
   * @param {string} tela — ID sem prefixo "tela-"
   */
  nav(tela) {
    if (tela === this._telaAtual) return;

    const destino = document.getElementById(`tela-${tela}`);
    if (!destino) {
      console.warn(`[BarberFlow] Tela "${tela}" não encontrada.`);
      return;
    }

    this._historico.push(this._telaAtual);
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    destino.classList.add('ativa');

    this._telaAtual = tela;
    this._atualizarUI(tela);
  }

  /**
   * Volta para a tela anterior no histórico.
   */
  voltar() {
    if (this._historico.length === 0) return;

    const anterior = this._historico.pop();
    const destino  = document.getElementById(`tela-${anterior}`);
    if (!destino) return;

    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    destino.classList.add('ativa');

    this._telaAtual = anterior;
    this._atualizarUI(anterior);
  }

  /**
   * Sincroniza visibilidade do footer e estado ativo dos botões.
   * @param {string} tela
   * @private
   */
  _atualizarUI(tela) {
    if (this._footer) {
      this._footer.style.display = this.telasComNav.has(tela) ? 'flex' : 'none';
    }

    this._navBtns.forEach(btn =>
      btn.classList.toggle('ativo', btn.dataset.tela === tela)
    );
  }
}
