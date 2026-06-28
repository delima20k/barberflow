import { MinhaBarbeariaPage } from './pages/MinhaBarbeariaPage.js';

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
    'parcerias',
    'financas',
    'perfil',
    'criar',
    'sair',
    'destaques',
    'barbearias',
    'barbeiros',
    'barbearia',
    'barbeiro',
  ]);

  static #TELAS_OFFLINE = new Set(['inicio', 'pesquisa', 'barbearias', 'barbeiros', 'barbearia', 'barbeiro']);
  static #TELAS_ASSINATURA = new Set([
    'agenda',
    'mensagens',
    'minha-barbearia',
    'parcerias',
    'financas',
    'criar',
  ]);

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
  #barbeariaPublicaPage;
  #barbeiroPage;
  #parceriasPage;
  #financasPage;
  #assinaturaGatePendente = false;

  constructor() {
    super('inicio');
    this.#auth     = new AuthController((t) => this.push(t), 'professional', () => this.getProType());
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
    this.#barbeariaPublicaPage = new BarbeariaPage();
    this.#barbeiroPage         = new BarbeiroPage();
    this.#parceriasPage        = new ParceriasPage();
    this.#financasPage         = new FinancasPage();
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
    this.#barbeariaPublicaPage.bind();
    this.#barbeiroPage.bind();
    this.#parceriasPage.bind();
    this.#financasPage.bind();
    AuthService.iniciarListener();
    AuthService.inicializarSessao();

    // QueueConfirmService desativado: notificações ao barbeiro chegam via
    // Realtime (tabela notifications) → NotificationService → MinhaBarbeariaPage.
  }

  /** Navega para o login. */
  irParaLogin() { this.nav('login'); }

  /**
   * Intercepta push para ajustar o formulário de cadastro conforme o tipo
   * selecionado (barbeiro / barbearia) antes de exibir a tela.
   * @override
   */
  push(tela) {
    if (this.#deveVerificarAssinatura(tela)) {
      this.#navegarComAssinatura(tela, 'push');
      return;
    }
    this.#prepararTela(tela);
    super.push(tela);
  }

  nav(tela) {
    if (this.#deveVerificarAssinatura(tela)) {
      this.#navegarComAssinatura(tela, 'nav');
      return;
    }
    this.#prepararTela(tela);
    super.nav(tela);
  }

  /**
   * Navega para a tela de planos — ponto de entrada do cadastro.
   * Sempre mostra os planos antes de criar conta.
   */
  irParaCadastroGuardado() { this.push('planos-pro'); }

  irParaPlanosPro() {
    this.fecharMenu?.();
    this.push('planos-pro');
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

  #prepararTela(tela) {
    if (tela === 'planos-pro') this.#planos.prepararTelaPlanos(AuthService.getPerfil()?.pro_type ?? null);
    if (tela === 'cadastro') this.#cadastro.ajustarFormularioPorTipo();
    if (tela === 'confirmar-plano-pro') this.#planos.prepararConfirmacao();
  }

  #deveVerificarAssinatura(tela) {
    const logado = typeof AppState !== 'undefined' && AppState.get('isLogado') === true;
    return logado && BarberFlowProfissional.#TELAS_ASSINATURA.has(tela);
  }

  async #navegarComAssinatura(tela, modo) {
    if (this.#assinaturaGatePendente) return;
    this.#assinaturaGatePendente = true;
    try {
      const status = await MonetizationGuard.assinaturaPermiteAcesso();
      if (!status.accessAllowed) {
        this.#prepararTela('planos-pro');
        super.push('planos-pro');
        return;
      }

      this.#prepararTela(tela);
      if (modo === 'nav') super.nav(tela);
      else super.push(tela);
    } finally {
      this.#assinaturaGatePendente = false;
    }
  }
}

/* ── Ponto de entrada ──────────────────────────────────────── */
const Pro = new BarberFlowProfissional();
globalThis.Pro = Pro;
document.addEventListener('DOMContentLoaded', () => AppBootstrap.init());
