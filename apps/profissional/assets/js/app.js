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
  #queueWidget;
  #barbeirosPage;
  #barbeariasPage;
  #barbeariaPublicaPage;
  #barbeiroPage;
  #parceriasPage;
  #financasPage;
  #assinaturaGatePendente = false;
  #trialAutoTentado = false;

  constructor() {
    super('inicio');
    this.#auth     = new AuthController((t) => this.push(t), 'professional', () => this.getProType());
    this.#cadastro = new CadastroController();
    this.#planos   = new PlanosController((t) => this.push(t));
    this.#termos   = new TermosController((t) => this.push(t));
    this.#destaquesPage      = new DestaquesPage();
    this.#agendaPage           = new AgendaPage();
    this.#barbeariaPage        = new MinhaBarbeariaPage();
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
    this.#queueWidget.bind();
    this.#barbeirosPage.bind();
    this.#barbeariasPage.bind();
    this.#barbeariaPublicaPage.bind();
    this.#barbeiroPage.bind();
    this.#parceriasPage.bind();
    this.#financasPage.bind();
    AuthService.iniciarListener();
    AuthService.inicializarSessao();
    setTimeout(() => {
      PaymentFlowHandler.verificarPagamentoPendente?.(
        () => {
          this.#prepararTela('inicio');
          super.nav('inicio');
        },
      );
    }, 1200);

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

  #prepararTela(tela, { reason = null } = {}) {
    // reason só é repassado quando a tela de planos é aberta por bloqueio do
    // gate (#navegarComAssinatura). Navegação espontânea → reason null → sem banner.
    if (tela === 'planos-pro') this.#planos.prepararTelaPlanos(AuthService.getPerfil()?.pro_type ?? null, reason);
    if (tela === 'cadastro') this.#cadastro.ajustarFormularioPorTipo();
  }

  #deveVerificarAssinatura(tela) {
    const logado = typeof AppState !== 'undefined' && AppState.get('isLogado') === true;
    return logado && BarberFlowProfissional.#TELAS_ASSINATURA.has(tela);
  }

  async #navegarComAssinatura(tela, modo) {
    if (this.#assinaturaGatePendente) return;
    this.#assinaturaGatePendente = true;
    try {
      let status = await MonetizationGuard.assinaturaPermiteAcesso();

      // Rede de segurança: profissional que escolheu "Começar teste grátis" no
      // cadastro mas cuja ativação não ocorreu (timing do token, erro
      // transitório no POST /trial). Em vez de jogar para planos, ativa o trial
      // agora — ao tentar abrir a primeira tela paga — e reavalia o acesso.
      // Só dispara uma vez por sessão e só para intenção de trial (o fluxo pago
      // continua indo ao checkout normalmente). confirmarPlano chama limpar() no
      // sucesso, então a flag não re-dispara.
      //
      // CRÍTICO (financeiro): só recupera quem NUNCA teve assinatura
      // (reason === 'missing_subscription'). Trial expirado
      // (reason === 'expired_subscription') NÃO renova — senão o gate viraria
      // uma brecha de trial infinito. O backend recusa de qualquer forma
      // (trial_already_used), mas nem chegamos a tentar.
      if (!status.accessAllowed
          && status.reason === 'missing_subscription'
          && !this.#trialAutoTentado
          && typeof PlanosService !== 'undefined'
          && MonetizationGuard.confirmacaoPendente
          && MonetizationGuard.planoSelecionado === 'trial') {
        this.#trialAutoTentado = true;
        await new Promise((resolve) => PlanosService.confirmarPlano(resolve, () => resolve()));
        status = await MonetizationGuard.assinaturaPermiteAcesso({ force: true });
      }

      if (!status.accessAllowed) {
        // Repassa o motivo para a tela de planos exibir o banner adequado
        // (ex: "Seu plano venceu."). missing_subscription não gera banner.
        this.#prepararTela('planos-pro', { reason: status.reason });
        super.push('planos-pro');
        return;
      }

      if (typeof ProfessionalDocumentGuard !== 'undefined') {
        await ProfessionalDocumentGuard.ensure();
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
