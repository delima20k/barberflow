'use strict';

// =============================================================
// PlanosService.js — Regras de negócio para seleção de planos.
// App: apps/profissional
// =============================================================

class PlanosService {

  static selecionarTipo(tipo) {
    if (!['barbeiro', 'barbearia'].includes(tipo)) return { podeAvancar: false };
    sessionStorage.setItem('bf_tipo', tipo);
    return { podeAvancar: true };
  }

  static selecionarPlano(tipo, plano) {
    MonetizationGuard.setPlan(tipo, plano);
    MonetizationGuard.marcarConfirmacaoPendente();
  }

  static definirVoucherTrial(code) {
    MonetizationGuard.setTrialVoucher(code);
  }

  static limparVoucherTrial() {
    MonetizationGuard.limparTrialVoucher();
  }

  static async confirmarPlano(onSucesso, onErro) {
    const tipo = MonetizationGuard.tipoUsuario || 'barbeiro';
    const plano = MonetizationGuard.planoSelecionado || 'trial';

    try {
      if (plano === 'trial') {
        const { error } = await BffApiService.pagamentosProfissional.ativarTrial();
        if (error) throw error;
        MonetizationGuard.limpar();
        onSucesso?.();
        return;
      }

      await PaymentFlowHandler.iniciarFluxo(plano, () => {
        MonetizationGuard.limparConfirmacaoPendente();
        MonetizationGuard.limparCacheAssinatura();
        onSucesso?.();
      }, onErro, { tipo });
    } catch (err) {
      onErro?.(err?.message || 'Nao foi possivel confirmar o plano.');
    }
  }
}
