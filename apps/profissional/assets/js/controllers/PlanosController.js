'use strict';

// =============================================================
// PlanosController.js - Selecao de tipo, plano e confirmacao final
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
    this.#bindConfirmacaoPlano();
  }

  prepararConfirmacao() {
    const tipo = MonetizationGuard.tipoUsuario || 'barbeiro';
    const plano = MonetizationGuard.planoSelecionado || 'trial';
    const tipoTxt = tipo === 'barbearia' ? 'barbearia' : 'barbeiro';
    const planoTxt = this.#planoLabel(plano);

    const resumo = document.getElementById('pcp-resumo');
    if (resumo) resumo.textContent = `Voce escolheu o plano ${planoTxt} para ${tipoTxt}.`;

    document.querySelectorAll('[data-confirmar-plano]').forEach(btn => {
      btn.classList.toggle('pcp-option--ativo', btn.dataset.confirmarPlano === plano);
    });
  }

  prepararTelaPlanos(tipoLogado = null) {
    const tipoTravado = ['barbeiro', 'barbearia'].includes(tipoLogado) ? tipoLogado : null;
    const toggle = document.querySelector('.ppp-toggle');
    if (toggle) toggle.style.display = tipoTravado ? 'none' : '';

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

  #bindConfirmacaoPlano() {
    document.querySelectorAll('[data-confirmar-plano]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = MonetizationGuard.tipoUsuario || 'barbeiro';
        PlanosService.selecionarPlano(tipo, btn.dataset.confirmarPlano);
        this.prepararConfirmacao();
      });
    });

    document.getElementById('pcp-btn-mudar')
      ?.addEventListener('click', () => this.#pushFn('planos-pro'));

    document.getElementById('pcp-btn-continuar')
      ?.addEventListener('click', () => this.#confirmarPlanoFinal());
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
      this.#pushFn(usuarioLogado ? 'confirmar-plano-pro' : 'termos-legais');
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  async #confirmarPlanoFinal() {
    const btn = document.getElementById('pcp-btn-continuar');
    const erro = document.getElementById('pcp-erro');
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    if (erro) {
      erro.textContent = '';
      erro.style.display = 'none';
    }

    await PlanosService.confirmarPlano(
      () => this.#pushFn('inicio'),
      (msg) => {
        LoggerService.warn('[PlanosController] Confirmacao de plano falhou:', msg);
        if (erro) {
          erro.textContent = msg || 'Nao foi possivel confirmar o plano.';
          erro.style.display = 'block';
        }
      },
    );

    if (btn) btn.disabled = false;
  }

  #isUsuarioLogado() {
    const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    return Boolean(perfil?.id);
  }

  #abrirTermosCadastro() {
    sessionStorage.setItem('bf_termo_destino', 'cadastro');
    this.#pushFn('termos-legais');
  }

  #planoLabel(plano) {
    if (plano === 'mensal') return 'mensal';
    if (plano === 'trimestral') return 'trimestral';
    return 'teste gratis';
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
}
