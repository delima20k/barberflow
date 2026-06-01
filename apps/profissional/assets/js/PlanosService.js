'use strict';

// =============================================================
// PlanosService.js — Regras de negócio para seleção de planos.
// App: apps/profissional
//
// Centraliza a lógica que antes estava dispersa em PlanosController.
// Dependências: MonetizationGuard.js, PaymentFlowHandler.js (carregados antes)
//
// Uso:
//   const { podeAvancar } = PlanosService.selecionarTipo('barbeiro');
//   PlanosService.iniciarFluxo('barbeiro', 'mensal', onSucesso, onErro);
// =============================================================

class PlanosService {

  /**
   * Registra a escolha de tipo de usuário.
   *
   * Regras:
   *   - 'barbearia' → funcionalidade ainda não disponível → { podeAvancar: false }
   *   - 'barbeiro'  → persiste em sessionStorage → { podeAvancar: true }
   *
   * @param {'barbeiro'|'barbearia'} tipo
   * @returns {{ podeAvancar: boolean }}
   */
  static selecionarTipo(tipo) {
    if (tipo === 'barbearia') {
      return { podeAvancar: false };
    }
    sessionStorage.setItem('bf_tipo', tipo);
    return { podeAvancar: true };
  }

  /**
   * Inicia o fluxo de pagamento/plano.
   * Persiste tipo e plano via MonetizationGuard, então delega ao PaymentFlowHandler.
   *
   * @param {string}   tipo      — 'barbeiro' | 'barbearia'
   * @param {string}   plano     — 'trial' | 'mensal' | 'trimestral'
   * @param {Function} onSucesso — callback chamado em caso de sucesso
   * @param {Function} onErro    — callback chamado em caso de falha (recebe msg: string)
   */
  static iniciarFluxo(tipo, plano, onSucesso, onErro) {
    MonetizationGuard.setPlan(tipo, plano);
    PaymentFlowHandler.iniciarFluxo(plano, onSucesso, onErro);
  }
}
