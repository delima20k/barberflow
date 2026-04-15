'use strict';

/**
 * FooterScrollManager
 * Gerencia visibilidade do footer e exibe dica animada (gota) quando oculto.
 *
 * Ciclo da dica:
 *  - Ativa somente quando footer está oculto
 *  - Aparece a cada 3s, por 3x máx por sessão de home
 *  - Reinicia o contador ao navegar para outra tela e voltar ao início
 */
class FooterScrollManager {

  static #THRESHOLD_PC   = 0.30;
  static #COOLDOWN_MS    = 3000;
  static #DICA_INTERVALO = 3000;
  static #DICA_DURACAO   = 2500;
  static #DICA_MAX       = 3;

  static #tela     = null;
  static #footers  = [];
  static #btn      = null;
  static #dicaEl   = null;
  static #oculto   = false;
  static #cooldown = false;
  static #timer    = null;
  static #dicaCount  = 0;
  static #timerDica  = null;

  static init() {
    this.#tela    = document.getElementById('tela-inicio');
    this.#footers = ['footer-nav', 'footer-nav-offline']
                      .map(id => document.getElementById(id))
                      .filter(Boolean);
    this.#btn    = document.getElementById('btn-abrir-footer');
    this.#dicaEl = document.getElementById('footer-dica');

    if (!this.#tela) return;

    this.#tela.addEventListener('scroll', () => this.#avaliar(), { passive: true });

    document.querySelectorAll('.nav-btn[data-tela="inicio"]').forEach(btn => {
      btn.addEventListener('click', () => this.#resetarDica());
    });
  }

  static #avaliar() {
    if (this.#cooldown) return;
    const limiar = window.innerHeight * this.#THRESHOLD_PC;
    if (this.#tela.scrollTop > limiar && !this.#oculto) {
      this.#ocultar();
    } else if (this.#tela.scrollTop <= limiar && this.#oculto) {
      this.#exibir();
    }
  }

  static #ocultar() {
    this.#oculto = true;
    this.#footers.forEach(f => f.classList.add('oculto'));
    this.#btn?.classList.add('visivel');
    this.#agendarDica();
  }

  static #exibir() {
    this.#oculto = false;
    this.#footers.forEach(f => f.classList.remove('oculto'));
    this.#btn?.classList.remove('visivel');
    this.#pararDica();
  }

  static abrirPorBotao() {
    this.#exibir();
    this.#cooldown = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#cooldown = false; }, this.#COOLDOWN_MS);
  }

  /* ── Dica ──────────────────────────────────────────────────── */

  static #agendarDica() {
    if (!this.#oculto || this.#dicaCount >= this.#DICA_MAX || !this.#dicaEl) return;
    clearTimeout(this.#timerDica);
    this.#timerDica = setTimeout(() => this.#ciclarDica(), this.#DICA_INTERVALO);
  }

  static #ciclarDica() {
    if (!this.#oculto || this.#dicaCount >= this.#DICA_MAX || !this.#dicaEl) return;

    this.#dicaEl.classList.remove('animando', 'visivel');
    void this.#dicaEl.offsetWidth; // reflow para reiniciar animação
    this.#dicaEl.classList.add('visivel', 'animando');
    this.#dicaEl.setAttribute('aria-hidden', 'false');
    this.#dicaCount++;

    this.#timerDica = setTimeout(() => {
      this.#dicaEl.classList.remove('visivel', 'animando');
      this.#dicaEl.setAttribute('aria-hidden', 'true');
      this.#agendarDica();
    }, this.#DICA_DURACAO);
  }

  static #pararDica() {
    clearTimeout(this.#timerDica);
    if (!this.#dicaEl) return;
    this.#dicaEl.classList.remove('visivel', 'animando');
    this.#dicaEl.setAttribute('aria-hidden', 'true');
  }

  static #resetarDica() {
    this.#dicaCount = 0;
    this.#pararDica();
  }
}

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

  static #TELAS_OFFLINE    = new Set(['inicio', 'pesquisa']);

  get telasComNav()    { return BarberFlowProfissional.#TELAS_COM_NAV; }
  get telasOffline()   { return BarberFlowProfissional.#TELAS_OFFLINE; }

  constructor() {
    super('inicio');
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
      pro_type:   MonetizationGuard.tipoUsuario || null,
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
    this.nav('login');
  }

  /**
   * Navega para a tela de planos — ponto de entrada do cadastro.
   * Sempre mostra os planos antes de criar conta.
   */
  irParaCadastroGuardado() {
    this.push('planos-pro');
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
   * Após pagamento confirmado, redireciona para aceite legal (obrigatório).
   * @param {'barbeiro'|'barbearia'} tipo
   * @param {'trial'|'mensal'|'trimestral'} plano
   */
  selecionarPlanoPro(tipo, plano) {
    MonetizationGuard.setPlan(tipo, plano);
    PaymentFlowHandler.iniciarFluxo(
      plano,
      () => {
        // Marca destino pós-aceite como cadastro (novo usuário)
        sessionStorage.setItem('bf_termo_destino', 'cadastro');
        this.push('termos-legais');
      },
      (msg) => {
        console.warn('[PlanosPro]', msg);
        sessionStorage.setItem('bf_termo_destino', 'cadastro');
        this.push('termos-legais');
      }
    );
  }

  /**
   * Registra aceite legal no Supabase e navega para o destino configurado.
   * Chamado pelo botão "Continuar" da tela-termos-legais.
   */
  async aceitarTermos() {
    const btn = document.getElementById('tl-btn-continuar');
    const erroEl = document.getElementById('tl-erro');

    // Valida o checkbox unico novamente por seguranca
    const aceiteConfirmado = !!document.getElementById('tl-cb-termos')?.checked;
    if (!aceiteConfirmado) return;

    // UI: spinner
    if (btn) btn.classList.add('tl-btn--carregando');
    if (erroEl) erroEl.style.display = 'none';

    try {
      const destino  = sessionStorage.getItem('bf_termo_destino') || 'cadastro';
      const planType = MonetizationGuard.planoSelecionado || 'trial';
      const flags    = { direitos_autorais: true, uso_arquivos: true, uso_midias_internas: true, uso_gps: true };

      // Verifica se já existe usuário autenticado
      const { data: { user } } = await SupabaseService.client.auth.getUser();

      if (!user) {
        // ── Fluxo pré-cadastro: usuário ainda não existe ───────────────────
        // Salva o aceite em sessionStorage para registrar após criar a conta
        LegalConsentService.marcarAceitePendente(planType, flags);
        sessionStorage.removeItem('bf_termo_destino');
        this.push(destino);
        return;
      }

      // ── Fluxo pós-login: usuário existe, registra direto no banco ─────────
      const { ok, error: erroResp } = await LegalConsentService.registrarAceite(
        user.id, planType, flags
      );

      if (!ok) throw new Error(erroResp || 'Erro ao registrar aceite.');

      sessionStorage.removeItem('bf_termo_destino');
      this.push(destino);

    } catch (e) {
      if (erroEl) {
        erroEl.textContent = e?.message || 'Erro ao salvar aceite. Tente novamente.';
        erroEl.style.display = 'block';
      }
    } finally {
      if (btn) btn.classList.remove('tl-btn--carregando');
    }
  }

  /**
   * Sincroniza estado do botão Continuar com o checkbox de aceite.
   * Chamado via onchange no checkbox da tela-termos-legais.
   */
  _sincronizarBotaoTermos() {
    const aceiteConfirmado = !!document.getElementById('tl-cb-termos')?.checked;
    const btn = document.getElementById('tl-btn-continuar');
    if (btn) btn.disabled = !aceiteConfirmado;
  }

  /**
   * Retorna o subtipo do profissional logado.
   * Prioridade: perfil do banco → sessionStorage (pré-cadastro).
   * @returns {'barbeiro'|'barbearia'|null}
   */
  getProType() {
    return AuthService.getPerfil()?.pro_type
        || MonetizationGuard.tipoUsuario
        || null;
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
  // Gate de boas-vindas — mostra overlay se não logado e não escolheu preview
  ProLandingGate.init();
  initMapToggle();
  // Footer inteligente: oculta ao rolar 30% da viewport na home
  FooterScrollManager.init();
  // Mapa interativo Leaflet com FAB flutuante
  MapWidget.init('mapa-container');
  // Lista de barbearias próximas (abaixo do mapa)
  NearbyBarbershopsWidget.init('nearby-map-widget');
  // Cards de barbearias na home (dinâmico, sem GPS obrigatório)
  NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista');
  // Cards em destaque (scroll horizontal)
  NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista');
  // Cards de barbeiros populares na home
  NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista');
  // Solicita GPS silenciosamente na primeira abertura
  GeoService.solicitarNaPrimeiraVez();
  // Bússola e orientação do mapa
  MapOrientationModule.init();
});

/* ── Service Worker (PWA / TWA) ──────────────────────────── */
if ('serviceWorker' in navigator) {
  // Recarrega a página automaticamente quando um novo SW assumir o controle
  // Garante que usuários com cache antigo recebam o código novo imediatamente
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!sessionStorage.getItem('sw_reloaded')) {
      sessionStorage.setItem('sw_reloaded', '1');
      location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        console.log('[BarberFlow Pro] SW registrado', reg.scope);
        // Força verificação de atualização do SW a cada carregamento
        reg.update();
      })
      .catch(err => console.warn('[BarberFlow Pro] SW erro', err));
  });
}