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
// BarberFlowProfissional — App principal (slim)
// =============================================================
/**
 * BarberFlow — App Profissional
 * Extende o Router base de ../../shared/js/Router.js
 *
 * Responsabilidades desta classe:
 *   - Declarar telasComNav e telasOffline
 *   - Instanciar controllers por domínio
 *   - Métodos de navegação chamados pelo HTML (nav/push/voltar vêm do Router)
 */
class BarberFlowProfissional extends Router {

  static #TELAS_COM_NAV = new Set([
    'inicio',
    'pesquisa',
    'agenda',
    'mensagens',
    'minha-barbearia',
    'perfil',
    'criar',
    'sair',
    'destaques',
    'barbearias',
    'barbeiros',
  ]);

  static #TELAS_OFFLINE = new Set(['inicio', 'pesquisa', 'barbearias', 'barbeiros']);

  get telasComNav()  { return BarberFlowProfissional.#TELAS_COM_NAV;  }
  get telasOffline() { return BarberFlowProfissional.#TELAS_OFFLINE; }

  #auth;
  #cadastro;
  #planos;
  #termos;
  #destaquesPage;
  #agendaPage;
  #barbeariaPage;
  #criarBarbeariaPage;
  #queueWidget;
  #barbeirosPage;
  #barbeariasPage;

  constructor() {
    super('inicio');
    this.#auth     = new AuthController((t) => this.nav(t), 'professional', () => this.getProType());
    this.#cadastro = new CadastroController();
    this.#planos   = new PlanosController((t) => this.push(t));
    this.#termos   = new TermosController((t) => this.push(t));
    this.#destaquesPage      = new DestaquesPage();
    this.#agendaPage           = new AgendaPage();
    this.#barbeariaPage        = new MinhaBarbeariaPage();
    this.#criarBarbeariaPage   = new CriarBarbeariaPage();
    this.#queueWidget          = new QueueWidget();
    this.#barbeirosPage  = new BarbeirosPage();
    this.#barbeariasPage = new BarbeariasPage();
    this.#auth.bind();
    this.#cadastro.bind();
    this.#planos.bind();
    this.#termos.bind();
    this.#destaquesPage.bind();
    this.#agendaPage.bind();
    this.#barbeariaPage.bind();
    this.#criarBarbeariaPage.bind();
    this.#queueWidget.bind();
    this.#barbeirosPage.bind();
    this.#barbeariasPage.bind();
    AuthService.iniciarListener();
    AuthService.inicializarSessao();
  }

  /** Navega para o login. */
  irParaLogin() { this.nav('login'); }

  /**
   * Navega para a tela de planos — ponto de entrada do cadastro.
   * Sempre mostra os planos antes de criar conta.
   */
  irParaCadastroGuardado() { this.push('planos-pro'); }

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
}

/* ── Ponto de entrada ──────────────────────────────────────── */
const Pro = new BarberFlowProfissional();
document.addEventListener('DOMContentLoaded', () => AppBootstrap.init());
