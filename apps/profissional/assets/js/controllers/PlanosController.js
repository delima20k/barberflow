'use strict';

// =============================================================
// PlanosController.js - Selecao de tipo e plano profissional
// =============================================================

class PlanosController {

  #pushFn;

  constructor(pushFn) {
    this.#pushFn = pushFn;
  }

  bind() {
    this.#bindToggleTipo();
    this.#bindTipoUsuario();
    this.#bindPlanosOld();
    this.#bindPlanosPro();
  }

  prepararTelaPlanos(tipoLogado = null) {
    const tipoTravado = ['barbeiro', 'barbearia'].includes(tipoLogado) ? tipoLogado : null;
    const toggle = document.querySelector('.ppp-toggle');
    if (toggle) toggle.style.display = tipoTravado ? 'none' : '';
    this.#ajustarCtasPlanosLogado(Boolean(tipoTravado));
    this.#ajustarTrialPlanosLogado(Boolean(tipoTravado));
    // Marca o card do plano PAGO ativo com "Plano aplicado" + dias de expiração.
    // Async (lê o status da assinatura na BFF) — não bloqueia o preparo da tela.
    void this.#marcarPlanoAtivo(tipoTravado);

    if (tipoTravado) {
      this.#alternarTipoPlano(tipoTravado, { persistir: false });
      return;
    }

    const tipoAtual = ['barbeiro', 'barbearia'].includes(MonetizationGuard.tipoUsuario)
      ? MonetizationGuard.tipoUsuario
      : 'barbeiro';
    this.#alternarTipoPlano(tipoAtual, { persistir: true });
  }

  #bindToggleTipo() {
    ['barbeiro', 'barbearia'].forEach(tipo => {
      document.getElementById(`ppp-btn-${tipo}`)
        ?.addEventListener('click', () => this.#alternarTipoPlano(tipo));
    });
  }

  #bindTipoUsuario() {
    document.querySelectorAll('[data-tipo-usuario]').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#selecionarTipoUsuario(btn.dataset.tipoUsuario)
      );
    });
  }

  #bindPlanosOld() {
    document.querySelectorAll('[data-plano-old]').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#selecionarPlanoLegado(btn.dataset.planoOld)
      );
    });
  }

  #bindPlanosPro() {
    document.querySelectorAll('[data-tipo][data-plano]').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#selecionarPlanoPro(btn.dataset.tipo, btn.dataset.plano, btn)
      );
    });
  }

  #alternarTipoPlano(tipo, { persistir = true } = {}) {
    const eBarbeiro = tipo === 'barbeiro';
    document.getElementById('ppp-btn-barbeiro')
      ?.classList.toggle('ppp-toggle-btn--ativo', eBarbeiro);
    document.getElementById('ppp-btn-barbearia')
      ?.classList.toggle('ppp-toggle-btn--ativo', !eBarbeiro);

    const elB = document.getElementById('ppp-cards-barbeiro');
    const elS = document.getElementById('ppp-cards-barbearia');
    if (elB) elB.style.display = eBarbeiro ? '' : 'none';
    if (elS) elS.style.display = eBarbeiro ? 'none' : '';

    const sub = document.getElementById('ppp-subtitulo');
    if (sub) sub.textContent = eBarbeiro
      ? 'Plano Profissional para Barbeiros'
      : 'Plano Profissional para Barbearias';

    if (persistir) sessionStorage.setItem('bf_tipo', tipo);
  }

  #ajustarCtasPlanosLogado(usuarioLogado) {
    document.querySelectorAll('#tela-planos-pro .ppp-btn[data-tipo][data-plano]').forEach(btn => {
      if (!btn.dataset.textoOriginal) btn.dataset.textoOriginal = btn.textContent.trim();
      btn.textContent = usuarioLogado ? 'Renovar plano' : btn.dataset.textoOriginal;
    });
  }

  #ajustarTrialPlanosLogado(usuarioLogado) {
    document.querySelectorAll('#tela-planos-pro .ppp-btn[data-plano="trial"]').forEach(btn => {
      const card = btn.closest('.ppp-card');
      if (card) card.style.display = usuarioLogado ? 'none' : '';
    });
  }

  // Dias até o plano expirar = teto de (ends_at - agora) / 24h. Nunca negativo.
  static calcularDiasExpiracao(endsAt, agoraMs = Date.now()) {
    const fim = Date.parse(endsAt);
    if (!Number.isFinite(fim)) return null;
    const DIA = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((fim - agoraMs) / DIA));
  }

  /**
   * Marca o card do plano PAGO ativo (mensal/trimestral) com o selo
   * "Plano aplicado" e mostra os dias até expirar logo abaixo do card.
   * Só para plano pago (status='active'); trial não recebe selo.
   * Idempotente: limpa marcações anteriores antes de reaplicar.
   * @param {string|null} proTypeHint — 'barbeiro' | 'barbearia'
   */
  async #marcarPlanoAtivo(proTypeHint = null) {
    const tela = document.getElementById('tela-planos-pro');
    if (!tela) return;

    // Limpa marcações de um preparo anterior
    tela.querySelectorAll('.ppp-card--ativo')
      .forEach(c => c.classList.remove('ppp-card--ativo'));
    tela.querySelectorAll('.ppp-plano-aplicado, .ppp-plano-expira')
      .forEach(el => el.remove());

    if (typeof MonetizationGuard === 'undefined') return;

    let sub = null;
    try {
      const status = await MonetizationGuard.assinaturaPermiteAcesso();
      sub = status?.subscription ?? null;
    } catch (_) { return; }

    // Só plano PAGO ativo — teste grátis (trial) não recebe selo
    if (!sub || sub.status !== 'active'
        || !['mensal', 'trimestral'].includes(sub.planType)) return;

    const proType = ['barbeiro', 'barbearia'].includes(proTypeHint)
      ? proTypeHint
      : (typeof AuthService !== 'undefined' ? AuthService.getPerfil()?.pro_type : null);
    if (!proType) return;

    const btn  = tela.querySelector(
      `.ppp-btn[data-tipo="${proType}"][data-plano="${sub.planType}"]`);
    const card = btn?.closest('.ppp-card');
    if (!card) return;

    card.classList.add('ppp-card--ativo');

    const selo = document.createElement('div');
    selo.className   = 'ppp-plano-aplicado';
    selo.textContent = '✓ Plano aplicado';
    card.prepend(selo);

    const dias = PlanosController.calcularDiasExpiracao(sub.endsAt);
    if (dias !== null) {
      const exp = document.createElement('p');
      exp.className   = 'ppp-plano-expira';
      exp.textContent = dias > 0
        ? `Seu plano expira em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
        : 'Seu plano expira hoje';
      card.after(exp);
    }
  }

  #selecionarTipoUsuario(tipo) {
    const { podeAvancar } = PlanosService.selecionarTipo(tipo);
    if (!podeAvancar) {
      this.#mostrarToastEmBreve();
      return;
    }
    this.#pushFn('planos-barbeiro');
  }

  #selecionarPlanoLegado(plano) {
    const tipo = sessionStorage.getItem('bf_tipo') || 'barbeiro';
    PlanosService.selecionarPlano(tipo, plano);
    this.#abrirTermosCadastro();
  }

  async #selecionarPlanoPro(tipo, plano, botao = null) {
    if (botao?.disabled) return;
    if (botao) botao.disabled = true;
    const usuarioLogado = this.#isUsuarioLogado();
    try {
      PlanosService.selecionarPlano(tipo, plano);
      if (!usuarioLogado) {
        this.#pushFn('termos-legais');
        return;
      }

      await PlanosService.confirmarPlano(
        () => this.#pushFn('inicio'),
        (msg) => this.#mostrarErroPagamento(msg),
      );
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  #isUsuarioLogado() {
    const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    return Boolean(perfil?.id);
  }

  #abrirTermosCadastro() {
    sessionStorage.setItem('bf_termo_destino', 'cadastro');
    this.#pushFn('termos-legais');
  }

  #mostrarToastEmBreve() {
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Em breve!',
        'Planos para barbearia chegando em breve!',
        NotificationService.TIPOS.ENGAJAMENTO
      );
      return;
    }
    let t = document.getElementById('toast-em-breve');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast-em-breve';
      t.className = 'pay-toast';
      document.body.appendChild(t);
    }
    t.textContent = 'Planos para barbearia chegando em breve!';
    t.classList.add('pay-toast--visivel');
    setTimeout(() => t.classList.remove('pay-toast--visivel'), 3000);
  }

  #mostrarErroPagamento(msg) {
    const texto = msg || 'Nao foi possivel iniciar a renovacao.';
    if (typeof LoggerService !== 'undefined') {
      LoggerService.warn?.('[PlanosController] Renovacao de plano falhou:', texto);
    }
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Pagamento indisponivel',
        texto,
        NotificationService.TIPOS?.ALERTA || NotificationService.TIPOS?.ERRO || NotificationService.TIPOS?.ENGAJAMENTO
      );
      return;
    }
    window.alert(texto);
  }
}
