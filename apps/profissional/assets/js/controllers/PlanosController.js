'use strict';

// =============================================================
// PlanosController.js — Seleção de tipo de usuário e planos
//
// Encapsula selecionarTipoUsuario(), selecionarPlano(),
// selecionarPlanoPro() e alternarTipoPlano() que antes estavam
// acumulados em BarberFlowProfissional.
//
// Binding programático via data-attributes — sem onclick no HTML:
//   [data-tipo-usuario]     → selecionarTipoUsuario
//   [data-plano-old]        → selecionarPlano (fluxo legado)
//   [data-tipo][data-plano] → selecionarPlanoPro (fluxo Pro)
//   #ppp-btn-barbeiro/barbearia → alternarTipoPlano (por ID)
// =============================================================

class PlanosController {

  #pushFn;  // (tela: string) => void — Pro.push()

  /**
   * @param {function(string): void} pushFn — ex: (t) => Pro.push(t)
   */
  constructor(pushFn) {
    this.#pushFn = pushFn;
  }

  /**
   * Registra todos os listeners de seleção de planos.
   * Chame uma vez no constructor do App.
   */
  bind() {
    this.#bindToggleTipo();
    this.#bindTipoUsuario();
    this.#bindPlanosOld();
    this.#bindPlanosPro();
  }

  // ── Privados ──────────────────────────────────────────────

  /** Toggle barbeiro/barbearia na tela planos-pro */
  #bindToggleTipo() {
    ['barbeiro', 'barbearia'].forEach(tipo => {
      document.getElementById(`ppp-btn-${tipo}`)
        ?.addEventListener('click', () => this.#alternarTipoPlano(tipo));
    });
  }

  /** Botões de seleção de tipo de usuário (fluxo legado) */
  #bindTipoUsuario() {
    document.querySelectorAll('[data-tipo-usuario]').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#selecionarTipoUsuario(btn.dataset.tipoUsuario)
      );
    });
  }

  /** Botões de plano do fluxo legado (tela-planos-barbeiro) */
  #bindPlanosOld() {
    document.querySelectorAll('[data-plano-old]').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#selecionarPlano(btn.dataset.planoOld)
      );
    });
  }

  /** Botões de plano Pro (tela-planos-pro) */
  #bindPlanosPro() {
    document.querySelectorAll('[data-tipo][data-plano]').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#selecionarPlanoPro(btn.dataset.tipo, btn.dataset.plano)
      );
    });
  }

  // ── Lógica de negócio (extraída do app.js) ────────────────

  #alternarTipoPlano(tipo) {
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
  }

  #selecionarTipoUsuario(tipo) {
    if (tipo === 'barbearia') {
      this.#mostrarToastEmBreve();
      return;
    }
    sessionStorage.setItem('bf_tipo', tipo);
    this.#pushFn('planos-barbeiro');
  }

  #selecionarPlano(plano) {
    const tipo = sessionStorage.getItem('bf_tipo') || 'barbeiro';
    MonetizationGuard.setPlan(tipo, plano);
    PaymentFlowHandler.iniciarFluxo(
      plano,
      () => this.#pushFn('cadastro'),
      (msg) => {
        LoggerService.warn('[PlanosController] Pagamento falhou:', msg);
        this.#pushFn('cadastro');
      }
    );
  }

  #selecionarPlanoPro(tipo, plano) {
    MonetizationGuard.setPlan(tipo, plano);
    PaymentFlowHandler.iniciarFluxo(
      plano,
      () => {
        sessionStorage.setItem('bf_termo_destino', 'cadastro');
        this.#pushFn('termos-legais');
      },
      (msg) => {
        LoggerService.warn('[PlanosController]', msg);
        sessionStorage.setItem('bf_termo_destino', 'cadastro');
        this.#pushFn('termos-legais');
      }
    );
  }

  #mostrarToastEmBreve() {
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Em breve!',
        '🚀 Planos para barbearia chegando em breve!',
        NotificationService.TIPOS.ENGAJAMENTO
      );
      return;
    }
    // Fallback sem NotificationService
    let t = document.getElementById('toast-em-breve');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast-em-breve';
      t.className = 'pay-toast';
      document.body.appendChild(t);
    }
    t.textContent = '🚀 Planos para barbearia chegando em breve!';
    t.classList.add('pay-toast--visivel');
    setTimeout(() => t.classList.remove('pay-toast--visivel'), 3000);
  }
}
