'use strict';

// =============================================================
// MonetizationGuard — Controla acesso a funcionalidades pagas.
// App: apps/profissional
//
// Persiste o tipo de usuário (barbeiro/barbearia) e o plano
// selecionado em sessionStorage durante o fluxo de cadastro.
//
// Uso:
//   MonetizationGuard.setPlan('barbeiro', 'mensal');
//   MonetizationGuard.exigirPlano(() => Pro.push('cadastro'));
//   MonetizationGuard.limpar(); // chamado após cadastro/logout
// =============================================================

class MonetizationGuard {

  static #TIPO_KEY  = 'bf_tipo';
  static #PLANO_KEY = 'bf_plano';

  /** @returns {string|null} */
  static get tipoUsuario()      { return sessionStorage.getItem(MonetizationGuard.#TIPO_KEY);  }

  /** @returns {string|null} */
  static get planoSelecionado() { return sessionStorage.getItem(MonetizationGuard.#PLANO_KEY); }

  /**
   * Persiste o tipo de usuário e o plano selecionado.
   * @param {string} tipo  — 'barbeiro' | 'barbearia'
   * @param {string} plano — 'trial' | 'mensal' | 'trimestral'
   */
  static setPlan(tipo, plano) {
    sessionStorage.setItem(MonetizationGuard.#TIPO_KEY,  tipo);
    sessionStorage.setItem(MonetizationGuard.#PLANO_KEY, plano);
  }

  /**
   * Executa cb se o usuário já escolheu um plano.
   * Caso contrário redireciona para 'planos-pro'.
   * @param {Function} cb
   */
  static exigirPlano(cb) {
    if (MonetizationGuard.planoSelecionado) {
      cb();
    } else {
      if (typeof Pro !== 'undefined') Pro.push('planos-pro');
    }
  }

  /**
   * Limpa seleção — chamado após cadastro concluído ou logout.
   */
  static limpar() {
    sessionStorage.removeItem(MonetizationGuard.#TIPO_KEY);
    sessionStorage.removeItem(MonetizationGuard.#PLANO_KEY);
  }
}
