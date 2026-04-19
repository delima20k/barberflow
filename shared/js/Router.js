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
  _footer        = null;
  _footerOffline = null;
  _navBtns       = [];
  _services      = {};
  // _logado removido — use AppState.get('isLogado') como fonte única de verdade

  /**
   * Ações que exigem autenticação — verificadas via event delegation em _bindDataAttributes.
   * Exibem a mensagem "Você precisa estar logado" antes de redirecionar para login.
   */
  static _ACOES_AUTH = new Set(['agendar', 'mensagem', 'pagar']);

  /**
   * Telas públicas — qualquer visitante pode acessar sem login.
   * Qualquer tela FORA deste Set exige autenticação.
   * Fonte única de verdade para AuthGuard.permitirNav() e _permitirNavAuth().
   */
  static TELAS_PUBLICAS = new Set(['inicio', 'pesquisa', 'barbearias', 'barbeiros']);

  /** Telas que exibem o footer completo (logado). @returns {Set<string>} */
  get telasComNav() { return new Set([]); }

  /** Telas que exibem o footer offline (sem login). @returns {Set<string>} */
  get telasOffline() { return new Set(['inicio', 'pesquisa']); }

  /**
   * @param {string} telaInicial — ID da tela exibida no boot (sem prefixo "tela-")
   * @param {object} [services]  — dependências injetáveis (opcional; usa singletons globais por padrão)
   * @param {object} [services.animation] — implementação de AnimationService
   * @param {object} [services.menu]      — implementação de MenuService
   * @param {object} [services.avatar]    — implementação de AvatarService
   * @param {object} [services.splash]    — implementação de SplashService
   * @param {object} [services.logout]    — implementação de LogoutScreen
   * @param {object} [services.story]     — implementação de StoryViewer
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
    };
    this._footer        = document.getElementById('footer-nav');
    this._footerOffline = document.getElementById('footer-nav-offline');
    this._navBtns       = Array.from(document.querySelectorAll('.nav-btn'));

    // Oculta ambos os footers inicialmente
    if (this._footer)        this._footer.style.display        = 'none';
    if (this._footerOffline) this._footerOffline.style.display = 'none';

    this._telaAtual = telaInicial;

    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    // Home fica sempre visível por CSS; não precisa de .ativa
    if (telaInicial !== 'inicio') {
      const telaEl = document.getElementById(`tela-${telaInicial}`);
      if (telaEl) telaEl.classList.add('ativa');
    }

    this._atualizarUI(telaInicial);
    this._bindLoginEvent();
    this._bindDataAttributes();

    // Modo visitante — bloqueia visualmente botões de ação para usuários não logados
    /** @type {GuestMode|null} */
    this._guestMode = typeof GuestMode !== 'undefined' ? new GuestMode() : null;

    // Sincroniza o footer automaticamente sempre que o estado de login mudar
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(() => this._atualizarUI(this._telaAtual));
    }

    // Remove boot-lock e libera o CSS normal
    document.getElementById('boot-lock')?.remove();

    // Restaura estado correto quando a página volta do bfcache
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;

      // Cancela animações em curso e reseta todas as telas para o estado inicial
      document.querySelectorAll('.tela').forEach(t => {
        t.getAnimations().forEach(a => a.cancel());
        t.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');
        t.style.display       = '';
        t.style.pointerEvents = '';
        t.style.transform     = '';
      });

      // Volta sempre para o home — nunca exibe login ou outra tela no retorno
      this._telaAtual   = 'inicio';
      this._historico   = [];
      this._navegandoApp = false;
      this._atualizarUI('inicio');
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
    // Fallback: sem AuthGuard carregado
    const logado = typeof AppState !== 'undefined' ? AppState.get('isLogado') === true : false;
    if (!logado) { this._alertarLoginObrigatorio(); return false; }
    return true;
  }

  /**
   * Navega para a tela indicada.
   * @param {string} tela — ID sem prefixo "tela-"
   */
  nav(tela) {
    // Toggle: clicou no ícone da aba já aberta → fecha pela ESQUERDA (igual a voltar)
    if (tela === this._telaAtual && tela !== 'inicio') {
      const atual = document.getElementById(`tela-${this._telaAtual}`);
      this._historico = [];          // limpa histórico — volta pra home
      this._telaAtual = 'inicio';
      this._atualizarUI('inicio');
      this._animar(atual, null, 'saindo');  // sai pela esquerda, home já está embaixo
      return;
    }
    if (tela === this._telaAtual) return;

    // Guard de autenticação — bloqueia telas privadas para visitantes
    if (!this._permitirNavAuth(tela)) return;

    const destino = document.getElementById(`tela-${tela}`);
    if (!destino) { console.warn(`[BarberFlow] Tela "${tela}" não encontrada.`); return; }

    const telaAnterior = this._telaAtual;
    const atual = document.getElementById(`tela-${telaAnterior}`);

    this._historico.push(telaAnterior);
    this._telaAtual = tela;
    this._atualizarUI(tela);

    // Home é base fixa — nunca anima saída
    // Aba já aberta → carrossel: atual sai DIREITA (lento), nova entra ESQUERDA (lento)
    // Vindo da home  → nova entra pela ESQUERDA normalmente (sem exit)
    const carrossel = telaAnterior !== 'inicio';
    this._animar(
      carrossel       ? atual   : null,
      tela !== 'inicio' ? destino : null,
      carrossel       ? 'saindo-direita' : 'saindo',
      carrossel       ? 'entrando-lento' : 'ativa'
    );
  }

  /** Fecha a aba atual e volta sempre para o home.
   *  A aba sai pela ESQUERDA — NUNCA alterar isso.
   *  O histórico é limpo para que nenhuma aba anterior reapareça.
   */
  voltar() {
    if (this._telaAtual === 'inicio') return;

    const telaAtual = this._telaAtual;
    const atual = document.getElementById(`tela-${telaAtual}`);

    // Limpa histórico — garante que nada do passado remerge
    this._historico = [];
    this._telaAtual = 'inicio';
    this._atualizarUI('inicio');

    // Aba atual sai pela ESQUERDA — NUNCA mudar isso
    // Home já está por baixo — sem animação de entrada
    this._animar(
      telaAtual !== 'inicio' ? atual : null,
      null,     // home não anima — já está lá
      'saindo', // aba sai pela ESQUERDA — NUNCA mudar
      'ativa'   // ignorado pois destino é null
    );
  }

  /**
   * Navega para uma tela irmã no fluxo de auth (ex: login → cadastro).
   * @param {string} tela
   */
  push(tela) {
    if (tela === this._telaAtual) return;

    const destino = document.getElementById(`tela-${tela}`);
    if (!destino) { console.warn(`[BarberFlow] Tela "${tela}" não encontrada.`); return; }

    const telaAnterior = this._telaAtual;
    const atual = document.getElementById(`tela-${telaAnterior}`);

    this._historico.push(telaAnterior);
    this._telaAtual = tela;
    this._atualizarUI(tela);

    // Fluxo de auth (login ↔ cadastro ↔ esqueceu-senha):
    // atual sai pela DIREITA, nova entra pela ESQUERDA — padrão carrossel
    this._animar(
      telaAnterior !== 'inicio' ? atual   : null,
      tela         !== 'inicio' ? destino : null,
      'saindo-direita',
      'entrando-lento'
    );
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
    const mostrarCompleto = logado && this.telasComNav.has(tela);
    if (this._footer)        this._footer.style.display        = mostrarCompleto ? 'flex' : 'none';
    if (this._footerOffline) this._footerOffline.style.display = mostrarCompleto ? 'none' : 'flex';

    this._navBtns.forEach(btn =>
      btn.classList.toggle('ativo', btn.dataset.tela === tela)
    );
    document.querySelectorAll('.menu-nav-item[data-tela]').forEach(item =>
      item.classList.toggle('ativo', item.dataset.tela === tela)
    );
  }

  /* ─────────────────────────────────────────────────────────────
     MENU DRAWER — delegates para MenuService
  ───────────────────────────────────────────────────────────── */

  toggleMenu()          { this._services.menu?.toggle(); }
  fecharMenu()          { this._services.menu?.fechar(); }
  navDoMenu(tela)       { this._services.menu?.navDoMenu(tela, t => this.nav(t)); }

  /* ─────────────────────────────────────────────────────────────
     STORIES — delegates para StoryViewer
  ───────────────────────────────────────────────────────────── */

  toggleLike(btn)        { this._services.story?.toggleLike(btn); }
  toggleStoryVideo(wrap) {
    const video = wrap.querySelector('.story-video');
    const play  = wrap.querySelector('.story-play-btn');
    if (video.paused) { video.play();  play.classList.add('playing'); }
    else              { video.pause(); play.classList.remove('playing'); }
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
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Login necessário',
        'Você precisa estar logado',
        'warning'
      );
    } else {
      // Fallback nativo — toast leve no rodapé
      const id = '__router-auth-toast';
      if (document.getElementById(id)) return;
      const el = document.createElement('div');
      el.id            = id;
      el.textContent   = 'Você precisa estar logado';
      el.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(30,20,10,.92)',
        'color:#D4AF37',
        'padding:.55rem 1.25rem',
        'border-radius:2rem',
        'font-size:.88rem',
        'z-index:9999',
        'pointer-events:none',
        'white-space:nowrap',
        'box-shadow:0 2px 12px rgba(0,0,0,.5)',
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2800);
    }
    // Redireciona para login — evita loop se já estiver na tela de login
    if (this._telaAtual !== 'login') {
      this.push('login');
    }
  }

  _bindLoginEvent() {
    document.addEventListener('barberflow:login', e => {
      const { nome } = e.detail || {};
      if (nome) {
        const usernameEl = document.getElementById('menu-username');
        if (usernameEl) usernameEl.childNodes[0].nodeValue = nome + ' ';
        const subEl = document.getElementById('menu-user-sub');
        if (subEl) subEl.textContent = 'Bem-vindo(a)!';
        const labelEl = document.getElementById('header-user-label');
        if (labelEl) {
          const primeiro = nome.split(' ')[0];
          labelEl.textContent = 'Olá, ' + (primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase());
        }
      }
      document.getElementById('header-avatar-btn')?.classList.add('logado');
      document.getElementById('menu-avatar')?.classList.add('logado');
    });
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
    document.addEventListener('click', (e) => {
      // data-nav
      const navEl = e.target.closest('[data-nav]');
      if (navEl) { e.preventDefault(); this.nav(navEl.dataset.nav); return; }

      // data-push
      const pushEl = e.target.closest('[data-push]');
      if (pushEl) { e.preventDefault(); this.push(pushEl.dataset.push); return; }

      // data-voltar
      const voltarEl = e.target.closest('[data-voltar]');
      if (voltarEl) { e.preventDefault(); this.voltar(); return; }

      // data-menu-nav — fecha drawer e depois navega
      const menuNavEl = e.target.closest('[data-menu-nav]');
      if (menuNavEl) { e.preventDefault(); this.navDoMenu(menuNavEl.dataset.menuNav); return; }

      // data-navapp — splash + redirect para outro app
      const navappEl = e.target.closest('[data-navapp]');
      if (navappEl) { e.preventDefault(); this.navegarApp(navappEl.dataset.navapp); return; }

      // data-action — ações pontuais delegadas ao Router
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        const a = actionEl.dataset.action;
        if (a === 'confirmar-saida')  { e.preventDefault(); this.confirmarSaida();    return; }
        if (a === 'avatar-upload')    { e.preventDefault(); this.abrirUploadAvatar(); return; }

        // Guard inline — bloqueia agendar / mensagem / pagar para visitantes.
        // Fonte de verdade: AppState.get('isLogado'). Não depende de AuthGuard.
        if (Router._ACOES_AUTH.has(a)) {
          const logado = typeof AppState !== 'undefined' ? AppState.get('isLogado') === true : false;
          if (!logado) {
            e.preventDefault();
            this._alertarLoginObrigatorio();
            return;
          }
        }

        // Guard secundário via AuthGuard (cobre demais ações protegidas registradas externamente)
        if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao(a, this)) {
          e.preventDefault();
          return;
        }
      }
    }, { passive: false });
  }
}
