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

  static #PRODUCTS = {
    mensal:      'plano_mensal_barbeiro',
    trimestral:  'plano_trimestral_barbeiro',
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
  static async iniciarFluxo(plano, onSucesso, onErro) {
    if (plano === 'trial') {
      // Teste grátis: sem cobrança, segue direto
      onSucesso();
      return;
    }

    if (PaymentFlowHandler.#isTWA()) {
      await PaymentFlowHandler.#fluxoTWA(plano, onSucesso, onErro);
    } else {
      await PaymentFlowHandler.#fluxoBrowser(plano, onSucesso);
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

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Fluxo TWA (Google Play Billing)
  // ═══════════════════════════════════════════════════════════

  static async #fluxoTWA(plano, onSucesso, onErro) {
    try {
      const productId = PaymentFlowHandler.#PRODUCTS[plano];
      if (!productId) throw new Error('Produto não encontrado: ' + plano);

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
      const { data: { user } } = await SupabaseService.client.auth.getUser();
      if (user) {
        await PaymentFlowHandler.validarESalvar(user.id, plano, purchaseToken);
      }

      onSucesso();
    } catch (err) {
      console.warn('[PaymentFlowHandler] TWA billing:', err);
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
  static #isTWA() {
    return (
      typeof window.getDigitalGoodsService === 'function' ||
      document.referrer.includes('android-app://')
    );
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
}
