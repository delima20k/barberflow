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
  static #TRIAL_VOUCHER_KEY = 'bf_trial_voucher_code';
  static #STATUS_TTL_MS = 60000;
  static #statusCache = null;

  /** @returns {string|null} */
  static get tipoUsuario()      { return sessionStorage.getItem(MonetizationGuard.#TIPO_KEY);  }

  /** @returns {string|null} */
  static get planoSelecionado() { return sessionStorage.getItem(MonetizationGuard.#PLANO_KEY); }

  /** @returns {string|null} */
  static get trialVoucherCode() { return sessionStorage.getItem(MonetizationGuard.#TRIAL_VOUCHER_KEY); }

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
    if (plano !== 'trial') MonetizationGuard.limparTrialVoucher();
  }

  static setTrialVoucher(code) {
    const normalized = String(code ?? '').replace(/\s+/g, '').toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(normalized)) {
      sessionStorage.setItem(MonetizationGuard.#TRIAL_VOUCHER_KEY, normalized);
      return;
    }
    MonetizationGuard.limparTrialVoucher();
  }

  static limparTrialVoucher() {
    sessionStorage.removeItem(MonetizationGuard.#TRIAL_VOUCHER_KEY);
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
   * Verifica se a assinatura permite acesso ao painel.
   *
   * Distingue duas famílias de resultado bem diferentes:
   *   - Erro de rede/token ao CONSULTAR o status (ex: PWA reaberto após
   *     suspensão longa, token expirado, rede ainda não pronta) — reason
   *     'network_or_auth_error'. NÃO é um veredito real sobre o plano, então
   *     NUNCA é cacheado — a próxima chamada tenta de novo do zero.
   *   - Resposta de verdade do backend (mesmo quando accessAllowed=false,
   *     ex: plano vencido) — só esse caso é cacheado por #STATUS_TTL_MS.
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<{ accessAllowed: boolean, reason: string, subscription: object|null }>}
   */
  static async assinaturaPermiteAcesso({ force = false } = {}) {
    const agora = Date.now();
    if (!force
      && MonetizationGuard.#statusCache
      && agora - MonetizationGuard.#statusCache.checkedAt < MonetizationGuard.#STATUS_TTL_MS) {
      return MonetizationGuard.#statusCache.status;
    }

    const erroTransitorio = {
      accessAllowed: false,
      reason: 'network_or_auth_error',
      subscription: null,
    };

    if (typeof BffApiService === 'undefined'
      || !BffApiService.pagamentosProfissional?.statusAssinatura) {
      // Plumbing indisponível (ex: script ainda carregando) — não cacheia.
      return erroTransitorio;
    }

    const { data, error } = await BffApiService.pagamentosProfissional.statusAssinatura();
    if (error) {
      // Erro de transporte (rede/401/timeout) — não é veredito de plano,
      // não cacheia, pra próxima tentativa sair fresca.
      return erroTransitorio;
    }

    const status = {
      accessAllowed: data?.accessAllowed === true,
      reason: data?.reason ?? 'subscription_status_unavailable',
      subscription: data?.subscription ?? null,
    };
    MonetizationGuard.#statusCache = { checkedAt: agora, status };
    return status;
  }

  static limparCacheAssinatura() {
    MonetizationGuard.#statusCache = null;
  }

  /**
   * Limpa seleção — chamado após cadastro concluído ou logout.
   */
  static limpar() {
    sessionStorage.removeItem(MonetizationGuard.#TIPO_KEY);
    sessionStorage.removeItem(MonetizationGuard.#PLANO_KEY);
    sessionStorage.removeItem(MonetizationGuard.#CONFIRM_KEY);
    sessionStorage.removeItem(MonetizationGuard.#TRIAL_VOUCHER_KEY);
    MonetizationGuard.limparCacheAssinatura();
  }
}
