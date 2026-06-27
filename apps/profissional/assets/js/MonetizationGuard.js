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
  static #CONFIRM_KEY = 'bf_plano_confirmacao_pendente';

  /** @returns {string|null} */
  static get tipoUsuario()      { return sessionStorage.getItem(MonetizationGuard.#TIPO_KEY);  }

  /** @returns {string|null} */
  static get planoSelecionado() { return sessionStorage.getItem(MonetizationGuard.#PLANO_KEY); }

  static get confirmacaoPendente() {
    return sessionStorage.getItem(MonetizationGuard.#CONFIRM_KEY) === '1';
  }

  /**
   * Persiste o tipo de usuário e o plano selecionado.
   * @param {string} tipo  — 'barbeiro' | 'barbearia'
   * @param {string} plano — 'trial' | 'mensal' | 'trimestral'
   */
  static setPlan(tipo, plano) {
    if (!['barbeiro', 'barbearia'].includes(tipo)) return;
    if (!['trial', 'mensal', 'trimestral'].includes(plano)) return;
    sessionStorage.setItem(MonetizationGuard.#TIPO_KEY,  tipo);
    sessionStorage.setItem(MonetizationGuard.#PLANO_KEY, plano);
  }

  static marcarConfirmacaoPendente() {
    sessionStorage.setItem(MonetizationGuard.#CONFIRM_KEY, '1');
  }

  static limparConfirmacaoPendente() {
    sessionStorage.removeItem(MonetizationGuard.#CONFIRM_KEY);
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
    sessionStorage.removeItem(MonetizationGuard.#CONFIRM_KEY);
  }
}
