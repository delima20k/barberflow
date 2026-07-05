'use strict';

// =============================================================
// PaymentFlowHandler.js — Fluxo de pagamento (POO)
//
// Responsabilidades:
//   - Detectar ambiente (TWA/Android ou browser web)
//   - Iniciar fluxo de pagamento correto para cada plano
//   - Trial → sem cobrança, segue direto
//   - TWA → Digital Goods API + PaymentRequest (Google Play Billing)
//   - Browser → stub amigável (pagamento real só no APK)
//   - Validar compra e salvar no Supabase via Edge Function
//
// Uso:
//   PaymentFlowHandler.iniciarFluxo(plano, onSucesso, onErro?)
//   PaymentFlowHandler.validarESalvar(userId, plano, purchaseToken)
// =============================================================

class PaymentFlowHandler {
  static #browserPaymentInFlight = false;
  static #PENDING_ASAAS_KEY = 'bf_pagamento_asaas_pendente';

  // Product IDs registrados no Google Play Console
  // Formato: barberflow_<tipo>_<plano>
  static #PRODUCTS = {
    barbeiro: {
      mensal:      'barberflow_barbeiro_mensal',
      trimestral:  'barberflow_barbeiro_trimestral',
    },
    barbearia: {
      mensal:      'barberflow_barbearia_mensal',
      trimestral:  'barberflow_barbearia_trimestral',
    },
  };

  // URL da Edge Function no Supabase
  static #VALIDATE_URL = '/functions/v1/validate-purchase';

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o fluxo de pagamento para o plano informado.
   * @param {'trial'|'mensal'|'trimestral'} plano
   * @param {Function} onSucesso — chamado após pagamento confirmado
   * @param {Function} [onErro]  — chamado em falha (opcional)
   */
  static async iniciarFluxo(plano, onSucesso, onErro, opts = {}) {
    if (plano === 'trial') {
      // Teste grátis: sem cobrança, segue direto
      onSucesso();
      return;
    }

    if (PaymentFlowHandler.#isTWA()) {
      await PaymentFlowHandler.#fluxoTWA(plano, onSucesso, onErro, opts);
    } else {
      await PaymentFlowHandler.#fluxoBrowserAsaas(plano, onSucesso, onErro, opts);
    }
  }

  /**
   * Valida token de compra no backend e salva assinatura no Supabase.
   * @param {string} userId
   * @param {string} plano
   * @param {string} purchaseToken
   * @returns {Promise<{ok: boolean, endsAt: string}>}
   */
  static async validarESalvar(userId, plano, purchaseToken) {
    try {
      const resp = await fetch(PaymentFlowHandler.#VALIDATE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, plano, purchaseToken }),
      });
      if (!resp.ok) throw new Error('Validação falhou');
      return await resp.json();
    } catch (err) {
      console.warn('[PaymentFlowHandler] validarESalvar:', err);
      return { ok: false, endsAt: null };
    }
  }

  static async verificarPagamentoPendente(onLiberado, onPendente, onErro) {
    const pending = PaymentFlowHandler.#getPagamentoPendente();
    if (!pending?.paymentId) return false;

    const session = await PaymentFlowHandler.#getSession();
    if (!session?.access_token) return false;

    PaymentFlowHandler.#limparParametroRetorno();
    PaymentFlowHandler.#mostrarToast('Confirmando pagamento...');

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { error } = await BffApiService.pagamentosProfissional.buscarCobranca(pending.paymentId);
        if (error) throw error;

        if (typeof MonetizationGuard !== 'undefined') {
          MonetizationGuard.limparCacheAssinatura();
          const status = await MonetizationGuard.assinaturaPermiteAcesso({ force: true });
          if (status?.accessAllowed) {
            sessionStorage.removeItem(PaymentFlowHandler.#PENDING_ASAAS_KEY);
            MonetizationGuard.limpar();
            PaymentFlowHandler.#mostrarToast('Pagamento confirmado. Acesso liberado.');
            if (typeof onLiberado === 'function') onLiberado(status);
            return true;
          }
        }

        await PaymentFlowHandler.#delay(attempt < 3 ? 1500 : 3500);
      }

      PaymentFlowHandler.#mostrarToast('Pagamento em processamento. Aguarde alguns instantes e tente novamente.');
      if (typeof onPendente === 'function') onPendente(pending);
      return false;
    } catch (err) {
      PaymentFlowHandler.#mostrarToast(err?.message || 'Nao foi possivel confirmar o pagamento agora.');
      if (typeof onErro === 'function') onErro(err);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fluxo TWA (Google Play Billing)
  // ═══════════════════════════════════════════════════════════

  static async #fluxoTWA(plano, onSucesso, onErro, opts = {}) {
    try {
      // Resolve tipo (barbeiro ou barbearia) via MonetizationGuard
      const tipo = opts.tipo || (typeof MonetizationGuard !== 'undefined' && MonetizationGuard.tipoUsuario) || 'barbeiro';
      const productId = PaymentFlowHandler.#PRODUCTS[tipo]?.[plano];
      if (!productId) throw new Error(`Produto não encontrado: ${tipo}/${plano}`);

      // Digital Goods API — disponível apenas no TWA dentro do Google Play
      const service = await window.getDigitalGoodsService(
        'https://play.google.com/billing'
      );
      const [details] = await service.getDetails([productId]);
      if (!details) throw new Error('Produto não disponível na Play Store.');

      // Payment Request com Google Play Billing
      const request = new PaymentRequest(
        [{ supportedMethods: 'https://play.google.com/billing', data: { sku: productId } }],
        { total: { label: details.title, amount: details.price } }
      );

      const paymentResponse = await request.show();
      const { purchaseToken } = paymentResponse.details;
      await paymentResponse.complete('success');

      // Valida e persiste no backend
      const user = await SupabaseService.getUser();
      if (user) {
        await PaymentFlowHandler.validarESalvar(user.id, plano, purchaseToken);
      }

      onSucesso();
    } catch (err) {
      console.warn('[PaymentFlowHandler] TWA billing:', err);
      if (PaymentFlowHandler.#isTwaBillingUnsupported(err)) {
        console.warn('[PaymentFlowHandler] TWA billing indisponivel, usando checkout web Asaas');
        await PaymentFlowHandler.#fluxoBrowserAsaas(plano, onSucesso, onErro, opts);
        return;
      }
      // Erro recoverable: segue para cadastro sem bloquear
      if (typeof onErro === 'function') {
        onErro(err.message);
      } else {
        onSucesso(); // fallback silencioso
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fluxo Browser (stub)
  // ═══════════════════════════════════════════════════════════

  static async #fluxoBrowser(plano, onSucesso) {
    // No browser, pagamento real só acontece no APK/TWA.
    // Exibe toast informativo e prossegue para cadastro.
    PaymentFlowHandler.#mostrarToast(
      '📱 Pagamento completo disponível no app Android.\n' +
      'Crie sua conta agora — você será cobrado ao instalar o app.'
    );
    await new Promise(r => setTimeout(r, 2200));
    onSucesso();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Helpers
  // ═══════════════════════════════════════════════════════════

  /** Detecta se está rodando dentro de um TWA (Trusted Web Activity). */
  static async #fluxoBrowserAsaas(plano, onSucesso, onErro, opts = {}) {
    const tipo = opts.tipo || 'barbeiro';
    if (PaymentFlowHandler.#browserPaymentInFlight) {
      PaymentFlowHandler.#mostrarToast('Pagamento ja esta sendo gerado...');
      return;
    }

    const session = await PaymentFlowHandler.#getSession();

    if (!session?.access_token) {
      PaymentFlowHandler.#mostrarToast('Crie sua conta profissional para concluir o pagamento.');
      if (typeof onErro === 'function') onErro('Sessao obrigatoria para gerar a cobranca.');
      return;
    }

    try {
      PaymentFlowHandler.#browserPaymentInFlight = true;
      if (typeof ProfessionalDocumentGuard !== 'undefined') {
        await ProfessionalDocumentGuard.ensure();
      }
      PaymentFlowHandler.#mostrarToast('Gerando cobranca segura...');
      const { data, error } = await BffApiService.pagamentosProfissional.criarCobranca({
        proType: tipo,
        planType: plano,
        billingType: 'UNDEFINED',
      });
      if (error) throw error;

      const invoiceUrl = data?.invoiceUrl;
      if (!invoiceUrl) {
        throw new Error('Cobranca criada sem link de pagamento. Tente novamente ou fale com suporte.');
      }

      PaymentFlowHandler.#salvarPagamentoPendente(data);
      window.location.assign(invoiceUrl);
    } catch (err) {
      PaymentFlowHandler.#mostrarToast(err?.message || 'Nao foi possivel iniciar o pagamento.');
      if (typeof onErro === 'function') onErro(err?.message || 'Pagamento indisponivel.');
    } finally {
      PaymentFlowHandler.#browserPaymentInFlight = false;
    }
  }

  static #isTWA() {
    return (
      typeof window.getDigitalGoodsService === 'function' ||
      document.referrer.includes('android-app://')
    );
  }

  static #isTwaBillingUnsupported(err) {
    const name = String(err?.name ?? '').toLowerCase();
    const message = String(err?.message ?? err ?? '').toLowerCase();
    return name === 'operationerror'
      || message.includes('unsupported context')
      || message.includes('not supported')
      || message.includes('not available')
      || message.includes('nao suport')
      || message.includes('não suport')
      || message.includes('indisponivel')
      || message.includes('indisponível')
      || message.includes('getdigitalgoodsservice')
      || message.includes('paymentrequest');
  }

  static #mostrarToast(mensagem) {
    let toast = document.getElementById('pay-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pay-toast';
      toast.className = 'pay-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.classList.add('pay-toast--visivel');
    setTimeout(() => toast.classList.remove('pay-toast--visivel'), 3500);
  }

  static async #getSession() {
    try {
      if (typeof SupabaseService !== 'undefined' && typeof SupabaseService.getSession === 'function') {
        return await SupabaseService.getSession();
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  static #salvarPagamentoPendente(payment) {
    if (!payment?.id) return;
    sessionStorage.setItem(PaymentFlowHandler.#PENDING_ASAAS_KEY, JSON.stringify({
      paymentId: payment.id,
      asaasPaymentId: payment.asaasPaymentId ?? null,
      createdAt: Date.now(),
    }));
  }

  static #getPagamentoPendente() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(PaymentFlowHandler.#PENDING_ASAAS_KEY) || 'null');
      if (!parsed?.paymentId) return null;
      if (Date.now() - Number(parsed.createdAt || 0) > 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(PaymentFlowHandler.#PENDING_ASAAS_KEY);
        return null;
      }
      return parsed;
    } catch (_) {
      sessionStorage.removeItem(PaymentFlowHandler.#PENDING_ASAAS_KEY);
      return null;
    }
  }

  static #limparParametroRetorno() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('bf_pagamento')) return;
      url.searchParams.delete('bf_pagamento');
      window.history.replaceState(window.history.state ?? {}, document.title, `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {
      /* noop */
    }
  }

  static #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
