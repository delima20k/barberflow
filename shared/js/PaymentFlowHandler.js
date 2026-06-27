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
      PaymentFlowHandler.#mostrarToast('Gerando cobranca segura...');
      const cpfCnpj = PaymentFlowHandler.#documentoDaSessao(session)
        || await PaymentFlowHandler.#solicitarDocumentoCobranca();
      const { data, error } = await BffApiService.pagamentosProfissional.criarCobranca({
        proType: tipo,
        planType: plano,
        billingType: 'PIX',
        customer: { cpfCnpj },
      });
      if (error) throw error;

      const invoiceUrl = data?.invoiceUrl;
      if (!invoiceUrl) throw new Error('Cobranca criada sem link de pagamento.');

      window.location.assign(invoiceUrl);
    } catch (err) {
      PaymentFlowHandler.#mostrarToast(err?.message || 'Nao foi possivel iniciar o pagamento.');
      if (typeof onErro === 'function') onErro(err?.message || 'Pagamento indisponivel.');
    } finally {
      PaymentFlowHandler.#browserPaymentInFlight = false;
    }
  }

  static async #solicitarDocumentoCobranca() {
    const atual = '';
    for (;;) {
      const informado = window.prompt(
        'Para gerar a cobranca Pix, informe o CPF ou CNPJ do cliente pagador.',
        atual,
      );
      if (informado === null) throw new Error('CPF ou CNPJ obrigatorio para gerar a cobranca.');
      const digits = String(informado).replace(/\D/g, '');
      const valido = PaymentFlowHandler.#validarDocumento(digits);
      if (valido.ok) return digits;
      PaymentFlowHandler.#mostrarToast(valido.msg);
    }
  }

  static #documentoDaSessao(session) {
    const meta = session?.user?.user_metadata || {};
    const candidates = [meta.cpf_cnpj, meta.cpfCnpj, meta.cpf, meta.cnpj];
    for (const item of candidates) {
      const digits = String(item ?? '').replace(/\D/g, '');
      if (PaymentFlowHandler.#validarDocumento(digits).ok) return digits;
    }
    return null;
  }

  static #validarDocumento(digits) {
    if (digits.length === 11) {
      if (typeof InputValidator !== 'undefined' && typeof InputValidator.cpf === 'function') {
        return InputValidator.cpf(digits, true);
      }
      return { ok: true, msg: '' };
    }
    if (digits.length === 14) {
      if (typeof InputValidator !== 'undefined' && typeof InputValidator.cnpj === 'function') {
        return InputValidator.cnpj(digits, true);
      }
      return { ok: true, msg: '' };
    }
    return { ok: false, msg: 'Informe um CPF com 11 digitos ou CNPJ com 14 digitos.' };
  }

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
}
