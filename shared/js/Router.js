'use strict';

/**
 * BarberFlow — Base SPA Router
 *
 * Responsabilidade ÚNICA: controle de navegação (nav, push, voltar),
 * tela atual e histórico.
 *
 * Dependências injetáveis (segundo parâmetro `services`):
 *   animation  → AnimationService  (transições de tela)
 *   menu       → MenuService       (drawer hamburguer)
 *   avatar     → AvatarService     (upload de avatar)
 *   splash     → SplashService     (transição entre apps)
 *   logout     → LogoutScreen      (confirmação de saída)
 *   story      → StoryViewer       (interações de story)
 *
 * Uso padrão (produção):
 *   super('inicio')  — usa os singletons globais como padrão
 *
 * Uso em testes:
 *   super('inicio', { animation: mockAnimation, menu: mockMenu, ... })
 *
 * @abstract
 */
class Router {
  _telaAtual     = '';
  _historico     = [];
  _services      = {};
  _view          = null;   // NavigationViewService — toda manipulação DOM de navegação
  _navegandoApp  = false;
  // _logado removido — use AppState.get('isLogado') como fonte única de verdade

  // _ACOES_AUTH removido — AuthGuard.ACOES_PROTEGIDAS é a fonte única de verdade.
  // Qualquer ação que exige auth deve ser declarada SOMENTE em AuthGuard.js.

  /**
   * Telas públicas — qualquer visitante pode acessar sem login.
   * Qualquer tela FORA deste Set exige autenticação.
   * Fonte única de verdade para AuthGuard.permitirNav() e _permitirNavAuth().
   */
  static TELAS_PUBLICAS = new Set([
    // Telas compartilhadas (cliente + profissional)
    'inicio', 'pesquisa', 'barbearias', 'barbeiros', 'login', 'cadastro', 'destaques',
    // Perfil público de barbearia e de barbeiro — acessíveis sem login
    'barbearia', 'barbeiro',
    // Fluxo de cadastro profissional (visitante ainda não tem conta)
    'planos-pro', 'confirmar-plano-pro', 'planos-barbeiro', 'tipo-usuario', 'esqueceu-senha', 'redefinir-senha', 'termos-legais',
  ]);

  // Set alocado uma vez — referenciado no fallback de _bindDataAttributes
  static #ACOES_FALLBACK = new Set(['agendar', 'mensagem', 'pagar', 'pagamento', 'like', 'barbershop-favorite', 'avatar-upload']);
  static #BOTOES_VOLTAR_BINDADOS = new WeakSet();

  // ─── Retomada de sessão (PWA em 2º plano → volta de onde parou) ───
  // Persiste a última aba principal em localStorage e a restaura no boot,
  // desde que o retorno seja recente (janela de resumo). Cobre o cold-start
  // quando o SO mata o app em segundo plano (bfcache é tratado no pageshow).
  static #CHAVE_ULTIMA_TELA = 'bf_ultima_tela';
  static #JANELA_RESUMO_MS  = 30 * 60 * 1000; // 30 min
  static #HISTORY_KEY       = '__barberflowRouter';
  static #HISTORY_VERSION   = 1;
  // Telas que NÃO devem ser persistidas/restauradas: fluxo de auth, telas
  // efêmeras e telas de detalhe que dependem de uma entidade selecionada
  // (restaurá-las sem contexto mostraria uma tela vazia/quebrada).
  static #TELAS_NAO_PERSISTIR = new Set([
    'login', 'cadastro', 'esqueceu-senha', 'redefinir-senha', 'termos-legais', 'sair',
    'tipo-usuario', 'planos-pro', 'planos-barbeiro', 'confirmar-plano-pro',
    'criar', 'barbearia', 'barbeiro',
  ]);

  /** Telas que exibem o footer completo (logado). @returns {Set<string>} */
  get telasComNav() { return new Set([]); }

  /** Telas que exibem o footer offline (sem login). @returns {Set<string>} */
  get telasOffline() { return new Set(['inicio', 'pesquisa', 'destaques', 'barbearias', 'barbeiros', 'barbearia', 'barbeiro']); }

  /**
   * @param {string} telaInicial — ID da tela exibida no boot (sem prefixo "tela-")
   * @param {object} [services]  — dependências injetáveis (opcional; usa singletons globais por padrão)
   * @param {object} [services.animation] — implementação de AnimationService
   * @param {object} [services.menu]      — implementação de MenuService
   * @param {object} [services.avatar]    — implementação de AvatarService
   * @param {object} [services.splash]    — implementação de SplashService
   * @param {object} [services.logout]    — implementação de LogoutScreen
   * @param {object} [services.story]     — implementação de StoryViewer
   * @param {object} [services.view]      — implementação de NavigationViewService
   * @param {object} [services.logger]    — implementação de LoggerService
   */
  constructor(telaInicial = 'login', services = {}) {
    // Resolve dependências: valor injetado → singleton global → null-safe stub
    this._services = {
      animation: services.animation ?? (typeof AnimationService !== 'undefined' ? AnimationService : null),
      menu:      services.menu      ?? (typeof MenuService      !== 'undefined' ? MenuService      : null),
      avatar:    services.avatar    ?? (typeof AvatarService    !== 'undefined' ? AvatarService    : null),
      splash:    services.splash    ?? (typeof SplashService    !== 'undefined' ? SplashService    : null),
      logout:    services.logout    ?? (typeof LogoutScreen     !== 'undefined' ? LogoutScreen     : null),
      story:     services.story     ?? (typeof StoryViewer      !== 'undefined' ? StoryViewer      : null),
      // Logger injetável — sem acoplamento hard; fallback: console nativo
      logger:    services.logger    ?? (typeof LoggerService    !== 'undefined' ? LoggerService    : console),
    };

    // Camada de apresentação — toda manipulação de DOM relacionada à navegação
    this._view = services.view ?? new NavigationViewService();
    this._view.init(telaInicial);

    this._telaAtual = telaInicial;
    this._substituirHistory(telaInicial, []);
    this._bindPopstate();
    this._atualizarUI(telaInicial);
    this._bindLoginEvent();
    this._bindDataAttributes();

    // Modo visitante — bloqueia visualmente botões de ação para usuários não logados
    /** @type {GuestMode|null} */
    this._guestMode = typeof GuestMode !== 'undefined' ? new GuestMode() : null;
    this._guestMode?.init?.();

    // Sincroniza o footer automaticamente sempre que o estado de login mudar
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(() => this._atualizarUI(this._telaAtual));
    }

    // Libera o CSS normal após todo o setup estar completo
    this._view.removerBootLock();

    // Página retornou do bfcache (app estava em 2º plano, memória preservada).
    // Normaliza animações/CSS presos, mas PRESERVA a tela em que o usuário
    // estava — antes forçávamos 'inicio', descartando a posição dele.
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      this._navegandoApp = false;
      if (typeof this._view.normalizarPreservando === 'function') {
        this._view.normalizarPreservando(this._telaAtual);
      } else {
        // Fallback defensivo: se a view não expõe o método novo, mantém o
        // comportamento antigo (reset para home) em vez de quebrar.
        this._view.resetarParaHome();
        this._telaAtual = 'inicio';
        this._historico = [];
        this._substituirHistory('inicio', []);
      }
      this._atualizarUI(this._telaAtual);
    });

    // Cold-start: se o SO matou o app em 2º plano, restaura a última aba.
    this._agendarRestauracaoTela();
  }

  // History API: mantem o historico interno do Router sincronizado com o navegador/PWA.
  _historyDisponivel() {
    return typeof window !== 'undefined'
      && window.history
      && typeof window.history.pushState === 'function'
      && typeof window.history.replaceState === 'function';
  }

  _historyBackDisponivel() {
    return typeof window !== 'undefined'
      && window.history
      && typeof window.history.back === 'function';
  }

  _criarHistoryState(tela, historico = this._historico) {
    return {
      [Router.#HISTORY_KEY]: true,
      version: Router.#HISTORY_VERSION,
      tela,
      historico: Router.#normalizarHistorico(historico),
    };
  }

  static #ehHistoryState(state) {
    return !!state
      && state[Router.#HISTORY_KEY] === true
      && typeof state.tela === 'string'
      && Array.isArray(state.historico);
  }

  static #normalizarHistorico(historico) {
    if (!Array.isArray(historico)) return [];
    return historico
      .filter(tela => typeof tela === 'string' && tela.trim())
      .map(tela => tela.trim());
  }

  _substituirHistory(tela = this._telaAtual, historico = this._historico) {
    if (!this._historyDisponivel()) return;
    try {
      window.history.replaceState(
        this._criarHistoryState(tela, historico),
        typeof document !== 'undefined' ? document.title : '',
      );
    } catch (erro) {
      this._services.logger?.warn?.('[Router] Falha ao sincronizar replaceState:', erro?.message || erro);
    }
  }

  _empilharHistory(tela = this._telaAtual, historico = this._historico) {
    if (!this._historyDisponivel()) return;
    try {
      window.history.pushState(
        this._criarHistoryState(tela, historico),
        typeof document !== 'undefined' ? document.title : '',
      );
    } catch (erro) {
      this._services.logger?.warn?.('[Router] Falha ao sincronizar pushState:', erro?.message || erro);
    }
  }

  _bindPopstate() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.__barberFlowRouterAtual = this;
    if (window.__barberFlowRouterPopstateBound) return;

    window.__barberFlowRouterPopstateBound = true;
    window.addEventListener('popstate', event => {
      window.__barberFlowRouterAtual?._onPopstate(event);
    });
  }

  _onPopstate(event) {
    const state = event?.state;

    if (!Router.#ehHistoryState(state)) {
      this._substituirHistory(this._telaAtual, this._historico);
      return;
    }

    const tela = String(state.tela || '').trim();
    const historico = Router.#normalizarHistorico(state.historico);
    if (!tela) return;

    if (!this._permitirNavPopstate(tela)) {
      this._restaurarTela('login', [], { direcao: 'forward', sincronizarHistory: 'replace' });
      return;
    }

    this._restaurarTela(tela, historico, { direcao: 'auto', sincronizarHistory: false });
  }

  _permitirNavPopstate(tela) {
    if (Router.TELAS_PUBLICAS.has(tela)) return true;
    const logado = typeof AppState !== 'undefined' && AppState.get('isLogado') === true;
    if (logado) return true;
    this._view.exibirToastLoginObrigatorio();
    return false;
  }

  _restaurarTela(tela, historico, { direcao = 'auto', sincronizarHistory = false, transicao = 'nav' } = {}) {
    const destino = this._view.telaEl(tela);
    if (tela !== 'inicio' && !destino) {
      this._services.logger.warn(`[BarberFlow] Tela "${tela}" nao encontrada.`);
      this._substituirHistory(this._telaAtual, this._historico);
      return false;
    }

    const telaAnterior = this._telaAtual;
    const historicoAnterior = this._historico;
    const atual = this._view.telaEl(telaAnterior);
    const novoHistorico = Router.#normalizarHistorico(historico);

    this._historico = novoHistorico;
    this._telaAtual = tela;
    this._atualizarUI(tela);
    this._persistirTela(tela);

    if (sincronizarHistory === 'replace') this._substituirHistory(tela, novoHistorico);
    if (sincronizarHistory === 'push') this._empilharHistory(tela, novoHistorico);

    if (tela === telaAnterior) return true;

    const voltando = direcao === 'back'
      || (direcao === 'auto' && novoHistorico.length < historicoAnterior.length);

    if (voltando) {
      this._animar(
        telaAnterior !== 'inicio' ? atual : null,
        tela         !== 'inicio' ? destino : null,
        'saindo',
        tela !== 'inicio' ? 'entrando-lento' : 'ativa',
      );
      return true;
    }

    const carrossel = telaAnterior !== 'inicio';
    this._animar(
      carrossel         ? atual   : null,
      tela !== 'inicio' ? destino : null,
      transicao === 'push' || carrossel ? 'saindo-direita' : 'saindo',
      transicao === 'push' || carrossel ? 'entrando-lento' : 'ativa',
    );
    return true;
  }

  /**
   * Persiste a ultima aba principal para permitir retomar de onde o usuario parou.
   * Telas de fluxo/detalhe (ver #TELAS_NAO_PERSISTIR) limpam o registro.
   * @param {string} tela
   * @protected
   */
  _persistirTela(tela) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (!tela || Router.#TELAS_NAO_PERSISTIR.has(tela) || tela === 'inicio') {
        localStorage.removeItem(Router.#CHAVE_ULTIMA_TELA);
        return;
      }
      localStorage.setItem(
        Router.#CHAVE_ULTIMA_TELA,
        JSON.stringify({ tela, ts: Date.now() }),
      );
    } catch (_) { /* storage indisponível/cheio — silencioso */ }
  }

  /**
   * Lê a última aba persistida e, se o retorno for recente, restaura-a após o
   * boot. Telas públicas restauram assim que o app monta; telas privadas
   * aguardam a sessão ser confirmada (AppState.onAuth) para não cair no login.
   * @protected
   */
  _agendarRestauracaoTela() {
    if (typeof localStorage === 'undefined') return;

    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(Router.#CHAVE_ULTIMA_TELA) || 'null'); }
    catch (_) { salvo = null; }
    if (!salvo || typeof salvo.tela !== 'string') return;

    const { tela, ts } = salvo;
    if (tela === 'inicio' || Router.#TELAS_NAO_PERSISTIR.has(tela)) return;
    if (typeof ts !== 'number' || (Date.now() - ts) > Router.#JANELA_RESUMO_MS) return;

    const restaurar = () => {
      if (this._telaAtual === tela) return;
      if (!this._view.telaEl(tela)) return; // tela não existe neste app → ignora
      this.nav(tela);
    };

    // Tela pública → restaura assim que a subclasse terminar de montar.
    if (Router.TELAS_PUBLICAS.has(tela)) {
      setTimeout(restaurar, 0);
      return;
    }

    // Tela privada → exige login. Se já logado, restaura; senão aguarda o auth.
    if (typeof AppState === 'undefined') return;
    if (AppState.get('isLogado') === true) { setTimeout(restaurar, 0); return; }
    const off = AppState.onAuth((logado) => {
      if (logado === true) { if (typeof off === 'function') off(); setTimeout(restaurar, 0); }
    });
  }

  /**
   * Marca o usuário como logado no AppState e re-renderiza o footer.
   * Mantido por compatibilidade — preferível chamar AppState.set('isLogado', true).
   */
  entrar() {
    if (typeof AppState !== 'undefined') AppState.set('isLogado', true);
    this._atualizarUI(this._telaAtual);
  }

  /**
   * Marca o usuário como deslogado no AppState e re-renderiza o footer.
   * Mantido por compatibilidade — preferível chamar AppState.set('isLogado', false).
   */
  sair() {
    if (typeof AppState !== 'undefined') AppState.set('isLogado', false);
    this._atualizarUI(this._telaAtual);
  }

  /**
   * Confirma o logout via LogoutScreen (POO):
   * tela-sair + footer logado → saem pela DIREITA
   * footer deslogado → entra pela ESQUERDA
   * Chamado pelo botão central da tela-sair.
   */
  confirmarSaida() {
    this._services.logout?.executar(this);
  }

  /**
   * Delega animação de transição ao AnimationService.
   * @param {HTMLElement|null} saindo
   * @param {HTMLElement|null} entrando
   * @param {'saindo'|'saindo-direita'}  classeSaida
   * @param {'ativa'|'entrando-lento'}   classeEntrada
   * @private
   */
  _animar(saindo, entrando, classeSaida = 'saindo', classeEntrada = 'ativa') {
    this._services.animation?.animar(saindo, entrando, classeSaida, classeEntrada);
  }

  /**
   * Verifica se a navegação para `tela` é permitida.
   * Fluxo:
   *   1. Tela em TELAS_PUBLICAS  → permite sempre
   *   2. Delega ao AuthGuard (exibe aviso + redireciona para login se necessário)
   *   3. Fallback sem AuthGuard: bloqueia visitante com _alertarLoginObrigatorio()
   * @param {string} tela
   * @returns {boolean}
   * @private
   */
  _permitirNavAuth(tela) {
    if (Router.TELAS_PUBLICAS.has(tela)) return true;
    if (typeof AuthGuard !== 'undefined') return AuthGuard.permitirNav(tela, this);
    // Fallback: sem AuthGuard carregado — verifica AppState com segurança
    const logado = typeof AppState !== 'undefined' && AppState.get('isLogado') === true;
    if (!logado) { this._alertarLoginObrigatorio(); return false; }
    return true;
  }

  /**
   * Navega para a tela indicada.
   * @param {string} tela — ID sem prefixo "tela-"
   */
  nav(tela) {
    // Se o menu estiver aberto, fecha pelo lado DIREITO em sincronia com a animação da página
    this._services.menu?.fecharParaDireita();

    // Toggle: clicou no ícone da aba já aberta → fecha pela ESQUERDA (igual a voltar).
    // Guard intencionalmente omitido aqui: o destino é sempre 'inicio' (tela pública).
    if (tela === this._telaAtual && tela !== 'inicio') {
      const novoHistorico = [...this._historico, this._telaAtual];
      this._restaurarTela('inicio', novoHistorico, { direcao: 'back', sincronizarHistory: 'push' });
      return;
    }
    if (tela === this._telaAtual) return;

    // Guard de autenticação — bloqueia telas privadas para visitantes
    if (!this._permitirNavAuth(tela)) return;

    if (!this._view.telaEl(tela)) { this._services.logger.warn(`[BarberFlow] Tela "${tela}" não encontrada.`); return; }

    const novoHistorico = [...this._historico, this._telaAtual];
    this._restaurarTela(tela, novoHistorico, { direcao: 'forward', sincronizarHistory: 'push' });
  }

  /** Volta para a entrada anterior do History API.
   *  Sem History API disponivel, retorna ao inicio como fallback seguro.
   */
  voltar() {
    if (this._telaAtual === 'inicio') return;

    if (this._historico.length > 0 && this._historyBackDisponivel()) {
      window.history.back();
      return;
    }

    this._restaurarTela('inicio', [], { direcao: 'back', sincronizarHistory: 'replace' });
  }

  /**
   * Navega para uma tela irmã no fluxo de auth (ex: login → cadastro).
   * Guard de autenticação aplicado: telas privadas bloqueadas mesmo via push().
   * @param {string} tela
   */
  push(tela) {
    // Se o menu estiver aberto, fecha pelo lado DIREITO em sincronia com a animação da página
    this._services.menu?.fecharParaDireita();

    if (tela === this._telaAtual) return;

    // Guard de autenticação — impede acesso a telas privadas via push() direto
    if (!this._permitirNavAuth(tela)) return;

    if (!this._view.telaEl(tela)) { this._services.logger.warn(`[BarberFlow] Tela "${tela}" não encontrada.`); return; }

    const novoHistorico = [...this._historico, this._telaAtual];
    this._restaurarTela(tela, novoHistorico, { direcao: 'forward', sincronizarHistory: 'push', transicao: 'push' });
  }

  /**
   * Sincroniza visibilidade dos footers e estado ativo dos botões.
   * - Logado:        footer completo nas telasComNav
   * - Não logado:    footer offline (3 botões) nas telasOffline
   * @param {string} tela
   * @private
   */
  _atualizarUI(tela) {
    const logado = typeof AppState !== 'undefined' ? AppState.get('isLogado') : false;
    this._view.sincronizarUI(tela, logado, this.telasComNav, this.telasOffline, this._guestMode);
  }

  /* ─────────────────────────────────────────────────────────────
     MENU DRAWER — delegates para MenuService
  ───────────────────────────────────────────────────────────── */

  toggleMenu()          { this._services.menu?.toggle(); }
  fecharMenu()          { this._services.menu?.fechar(); }
  /** Navega a partir do menu — fecharParaDireita() é acionado automaticamente pelo nav(). */
  navDoMenu(tela)       { this.nav(tela); }

  /* ─────────────────────────────────────────────────────────────
     STORIES — delegates para StoryViewer
  ───────────────────────────────────────────────────────────── */

  toggleLike(btn)        { this._services.story?.toggleLike(btn); }
  toggleStoryVideo(videoWrap) {
    const video   = videoWrap.querySelector('.story-video');
    if (!video) return;
    const playBtn = videoWrap.querySelector('.story-play-btn'); // pode não existir (ícone removido)
    if (video.paused) { video.play();  playBtn?.classList.add('playing'); }
    else              { video.pause(); playBtn?.classList.remove('playing'); }
  }

  /* ─────────────────────────────────────────────────────────────
     AVATAR — delegates para AvatarService
  ───────────────────────────────────────────────────────────── */

  previewAvatar(input)   { this._services.avatar?.preview(input); }
  abrirUploadAvatar()    { this._services.avatar?.abrirUpload(this); }

  /* ─────────────────────────────────────────────────────────────
     SPLASH — delegate para SplashService
  ───────────────────────────────────────────────────────────── */

  navegarApp(url)        { this._services.splash?.navegar(url); }

  /**
   * Exibe o alerta "Você precisa estar logado" via NotificationService (ou fallback DOM)
   * e redireciona o usuário para a tela de login.
   * @private
   */
  _alertarLoginObrigatorio() {
    this._view.exibirToastLoginObrigatorio();
    // Redireciona para login — evita loop se já estiver na tela de login
    if (this._telaAtual !== 'login') {
      this.push('login');
    }
  }

  _bindLoginEvent() {
    this._view.bindLoginEvent();
  }

  /* ─────────────────────────────────────────────────────────────
     DELEGAÇÃO POR DATA-ATTRIBUTES
     Centraliza navegação e ações — elimina onclick inline no HTML.
     Handlers registrados por event delegation (um único listener).
  ───────────────────────────────────────────────────────────── */

  /**
   * Registra um único listener de clique no document para tratar
   * todos os elementos com data-attributes de navegação/ação.
   *
   * Atributos suportados:
   *   [data-nav="tela"]        → this.nav(tela)
   *   [data-push="tela"]       → this.push(tela)
   *   [data-voltar]            → this.voltar()
   *   [data-menu-nav="tela"]   → this.navDoMenu(tela)  (fecha menu + nav)
   *   [data-navapp="url"]      → this.navegarApp(url)
   *   [data-action="confirmar-saida"]  → this.confirmarSaida()
   *   [data-action="avatar-upload"]    → this.abrirUploadAvatar()
   */
  _bindDataAttributes() {
    this._bindBotoesVoltar();

    // Impede registro duplicado caso o Router seja instanciado mais de uma vez
    if (window.__routerClickBound) return;
    window.__routerClickBound = true;

    document.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-nav]');
      if (navEl) { e.preventDefault(); this.nav(navEl.dataset.nav); return; }

      const pushEl = e.target.closest('[data-push]');
      if (pushEl) { e.preventDefault(); this.push(pushEl.dataset.push); return; }

      const voltarEl = e.target.closest('[data-voltar]');
      if (voltarEl) { e.preventDefault(); this.voltar(); return; }

      // fecha o drawer antes de navegar
      const menuNavEl = e.target.closest('[data-menu-nav]');
      if (menuNavEl) { e.preventDefault(); this.navDoMenu(menuNavEl.dataset.menuNav); return; }

      const navappEl = e.target.closest('[data-navapp]');
      if (navappEl) { e.preventDefault(); this.navegarApp(navappEl.dataset.navapp); return; }

      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        const actionName = actionEl.dataset.action;

        if (actionName === 'voltar') { e.preventDefault(); this.voltar(); return; }

        // Logout não exige autenticação — confirmar sempre é permitido
        if (actionName === 'confirmar-saida') { e.preventDefault(); this.confirmarSaida(); return; }

        // Guard de ações protegidas — AuthGuard é a fonte única de verdade.
        // Inclui avatar-upload: visitante não pode trocar foto.
        if (typeof AuthGuard !== 'undefined') {
          if (!AuthGuard.permitirAcao(actionName, this)) { e.preventDefault(); return; }
        } else {
          // Fallback sem AuthGuard: bloqueia ações conhecidas via AppState
          if (Router.#ACOES_FALLBACK.has(actionName)) {
            const logado = typeof AppState !== 'undefined' ? AppState.get('isLogado') === true : false;
            if (!logado) { e.preventDefault(); this._alertarLoginObrigatorio(); return; }
          }
        }

        if (actionName === 'avatar-upload') { e.preventDefault(); this.abrirUploadAvatar(); return; }
      }
    }, { passive: false });
  }

  _bindBotoesVoltar() {
    document
      .querySelectorAll('button.btn-voltar[data-action="voltar"], button.btn-voltar[data-voltar], button.ppp-fechar-btn[data-action="voltar"]')
      .forEach(btn => {
        if (Router.#BOTOES_VOLTAR_BINDADOS.has(btn)) return;
        Router.#BOTOES_VOLTAR_BINDADOS.add(btn);
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.voltar();
        }, { passive: false });
      });
  }
}
