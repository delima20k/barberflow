'use strict';

// =============================================================
// MonetizationGuard — controla acesso a funções pagas
// =============================================================
class MonetizationGuard {

  static #TIPO_KEY  = 'bf_tipo';
  static #PLANO_KEY = 'bf_plano';

  static get tipoUsuario()     { return sessionStorage.getItem(MonetizationGuard.#TIPO_KEY);  }
  static get planoSelecionado(){ return sessionStorage.getItem(MonetizationGuard.#PLANO_KEY); }

  /**
   * Salva tipo de usuário e plano escolhidos na sessionStorage.
   */
  static setPlan(tipo, plano) {
    sessionStorage.setItem(MonetizationGuard.#TIPO_KEY,  tipo);
    sessionStorage.setItem(MonetizationGuard.#PLANO_KEY, plano);
  }

  /**
   * Se o usuário já escolheu um plano → executa cb.
   * Caso contrário → redireciona para a tela de tipo de usuário.
   * @param {Function} cb
   */
  static exigirPlano(cb) {
    if (MonetizationGuard.planoSelecionado) {
      cb();
    } else {
      if (typeof Pro !== 'undefined') Pro.push('planos-pro');
    }
  }

  /** Limpa seleção (chamado após cadastro concluído ou logout). */
  static limpar() {
    sessionStorage.removeItem(MonetizationGuard.#TIPO_KEY);
    sessionStorage.removeItem(MonetizationGuard.#PLANO_KEY);
  }
}

// =============================================================
// BarberFlowProfissional — App principal
// =============================================================
/**
 * BarberFlow — App Profissional
 * Extende o Router base de ../../shared/js/Router.js
 */
class BarberFlowProfissional extends Router {

  static #TELAS_COM_NAV = new Set([
    'inicio',
    'pesquisa',
    'agenda',
    'mensagens',
    'minha-barbearia',
    'perfil',
    'sair',
  ]);

  static #TELAS_OFFLINE = new Set(['inicio', 'pesquisa']);

  get telasComNav()  { return BarberFlowProfissional.#TELAS_COM_NAV; }
  get telasOffline() { return BarberFlowProfissional.#TELAS_OFFLINE; }

  constructor() {
    // Detecta sessão Supabase no localStorage para definir tela inicial
    const temSessao = Object.keys(localStorage)
      .some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    super(temSessao ? 'inicio' : 'planos-pro');
    AuthService.iniciarListener();
    AuthService.inicializarSessao();
  }

  // ── Documento (CPF/CNPJ) ──────────────────────────────────

  /** Alterna visibilidade dos inputs de documento. */
  alternarDoc(tipo) {
    const cpfWrap  = document.getElementById('cad-doc-cpf');
    const cnpjWrap = document.getElementById('cad-doc-cnpj');
    ['cpf','cnpj','ambos'].forEach(t =>
      document.getElementById(`cad-doc-btn-${t}`)?.classList.remove('cad-doc-btn--ativo')
    );
    document.getElementById(`cad-doc-btn-${tipo}`)?.classList.add('cad-doc-btn--ativo');
    if (tipo === 'cpf')   { cpfWrap.style.display=''; cnpjWrap.style.display='none'; }
    if (tipo === 'cnpj')  { cpfWrap.style.display='none'; cnpjWrap.style.display=''; }
    if (tipo === 'ambos') { cpfWrap.style.display=''; cnpjWrap.style.display=''; }
  }

  /** Aplica máscara de CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
  mascaraDoc(input, tipo) {
    let v = input.value.replace(/\D/g, '');
    if (tipo === 'cpf') {
      v = v.slice(0,11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      v = v.slice(0,14);
      v = v.replace(/(\d{2})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1/$2');
      v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
    input.value = v;
  }

  // ── Auth ──────────────────────────────────────────────────

  fazerLogin() {
    AuthService.login(
      document.getElementById('login-email'),
      document.getElementById('login-senha'),
      document.getElementById('login-erro'),
      (tela) => this.nav(tela)
    );
  }

  fazerCadastro() {
    AuthService.cadastro({
      nome:       document.getElementById('cad-nome')?.value,
      email:      document.getElementById('cad-email')?.value,
      telefone:   document.getElementById('cad-tel')?.value,
      cpf:        document.getElementById('cad-cpf')?.value  || null,
      cnpj:       document.getElementById('cad-cnpj')?.value || null,
      senha:      document.getElementById('cad-senha')?.value,
      senha2:     document.getElementById('cad-senha2')?.value,
      barbearia:  document.getElementById('cad-barbearia')?.value,
      role:       'professional',
    }, document.getElementById('cad-erro'), (tela) => {
      MonetizationGuard.limpar();
      this.nav(tela);
    });
  }

  fazerRecuperacao() {
    AuthService.recuperarSenha(
      document.getElementById('rec-email')?.value,
      document.getElementById('rec-erro'),
      (tela) => this.nav(tela)
    );
  }

  // ── Monetização — pontos de entrada protegidos ────────────

  /**
   * Navega para o login.
   * Se o usuário está no modo preview (sem plano) → exige plano primeiro.
   */
  irParaLogin() {
    if (MonetizationGuard.planoSelecionado) {
      this.nav('login');
    } else {
      // Usuário em preview: direciona para escolha de plano antes do login
      ProLandingGate.irParaCadastro();
    }
  }

  /**
   * Navega para o cadastro.
   * Garante que o usuário escolheu um plano antes.
   */
  irParaCadastroGuardado() {
    MonetizationGuard.exigirPlano(() => this.push('cadastro'));
  }

  /**
   * Salva o tipo de usuário escolhido e avança para a tela de planos.
   * @param {'barbeiro'|'barbearia'} tipo
   */
  selecionarTipoUsuario(tipo) {
    if (tipo === 'barbearia') {
      // Plano barbearia ainda em desenvolvimento
      this.#mostrarToastEmBreve();
      return;
    }
    sessionStorage.setItem('bf_tipo', tipo);
    this.push('planos-barbeiro');
  }

  /**
   * Usuário selecionou um plano. Inicia fluxo de pagamento e,
   * em caso de sucesso, redireciona para o cadastro.
   * @param {'trial'|'mensal'|'trimestral'} plano
   */
  selecionarPlano(plano) {
    const tipo = sessionStorage.getItem('bf_tipo') || 'barbeiro';
    MonetizationGuard.setPlan(tipo, plano);

    PaymentFlowHandler.iniciarFluxo(
      plano,
      () => this.push('cadastro'),          // sucesso → cadastro
      (msg) => {
        console.warn('[Planos] Pagamento falhou:', msg);
        this.push('cadastro');              // fallback: segue para cadastro
      }
    );
  }

  /**
   * Tela Planos Pro unificada — salva tipo+plano e inicia pagamento.
   * @param {'barbeiro'|'barbearia'} tipo
   * @param {'trial'|'mensal'|'trimestral'} plano
   */
  selecionarPlanoPro(tipo, plano) {
    MonetizationGuard.setPlan(tipo, plano);
    PaymentFlowHandler.iniciarFluxo(
      plano,
      () => this.push('cadastro'),
      (msg) => { console.warn('[PlanosPro]', msg); this.push('cadastro'); }
    );
  }

  /**
   * Alterna entre barbeiro/barbearia na tela-planos-pro.
   * @param {'barbeiro'|'barbearia'} tipo
   */
  alternarTipoPlano(tipo) {
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

  // ── Helpers privados ──────────────────────────────────────

  #mostrarToastEmBreve() {
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

/* ── Instância global ───────────────────────────────────────── */
const Pro = new BarberFlowProfissional();

function initMapToggle() {
  MapPanel.init('section-mapa');
}

/* ── Inicializa widgets de geolocalização ───────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMapToggle();
  // Mapa interativo Leaflet com FAB flutuante
  MapWidget.init('mapa-container');
  // Lista de barbearias próximas (abaixo do mapa)
  NearbyBarbershopsWidget.init('nearby-map-widget');
  // Solicita GPS silenciosamente na primeira abertura
  GeoService.solicitarNaPrimeiraVez();
  // Bússola e orientação do mapa
  MapOrientationModule.init();
});

/* ── Service Worker (PWA / TWA) ──────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[BarberFlow Pro] SW registrado', reg.scope))
      .catch(err => console.warn('[BarberFlow Pro] SW erro', err));
  });
}