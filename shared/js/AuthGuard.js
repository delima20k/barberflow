'use strict';

// =============================================================
// AuthGuard.js — Controle de acesso baseado em autenticação.
//
// Responsabilidades:
//   - Definir rotas protegidas por app (cliente / profissional)
//   - Definir ações que exigem autenticação
//   - Expor requireAuth(), permitirNav(), permitirAcao()
//   - Zero acoplamento com Router — recebe instância via parâmetro
//
// Regra de negócio:
//   ✔ Visitante pode: inicio, pesquisa, barbearias, barbeiros
//   ✗ Visitante NÃO pode: agendamento, mensagens, pagamento, perfil,
//                          favoritas, agenda, minha-barbearia, sair
//
// Fonte de verdade: AppState.get('isLogado')
// Dependências: AppState.js (carregado antes deste arquivo)
// =============================================================

const AuthGuard = (() => {

  // ── Rotas protegidas por app ───────────────────────────────

  const _ROTAS_CLIENTE = new Set([
    'agendamento',
    'mensagens',
    'pagamento',
    'perfil',
    'favoritas',
    'sair',
  ]);

  const _ROTAS_PRO = new Set([
    'agendamento',
    'mensagens',
    'pagamento',
    'perfil',
    'minha-barbearia',
    'agenda',
    'sair',
  ]);

  // ── Ações protegidas (data-action values) ─────────────────

  /**
   * Set de data-action values que exigem autenticação.
   * Interceptado pelo Router._bindDataAttributes e pelas Pages.
   */
  const ACOES_PROTEGIDAS = Object.freeze(new Set([
    'agendar',
    'mensagem',
    'pagar',
    'barbershop-favorite',
    'barbershop-like',
    'barbershop-dislike',
    'professional-like',
    'professional-favorite',
    'pagamento',
    'like',
    'avatar-upload',
  ]));

  // ── Helpers privados ──────────────────────────────────────

  /** Detecta se o app atual é o profissional. */
  function _ehPro() {
    return typeof BarberFlowProfissional !== 'undefined';
  }

  /** Retorna o Set de rotas protegidas do app atual. */
  function _getRotas() {
    return _ehPro() ? _ROTAS_PRO : _ROTAS_CLIENTE;
  }

  /** Fonte única de verdade — nunca acessa DOM, nunca faz rede. */
  function _estaLogado() {
    return typeof AppState !== 'undefined'
      ? AppState.get('isLogado') === true
      : false;
  }

  /** Exibe popup centralizada de login/cadastro por 3 segundos. */
  function _mostrarAvisoLogin() {
    const ID = '__bf-auth-popup';
    if (document.getElementById(ID)) return;  // já visível

    const overlay = document.createElement('div');
    overlay.id = ID;
    overlay.className = 'bf-auth-popup-overlay';
    overlay.innerHTML = `
      <div class="bf-auth-popup" role="alertdialog" aria-modal="true" aria-label="Login necessário">
        <div class="bf-auth-popup-icon">🔐</div>
        <p class="bf-auth-popup-title">Acesso restrito</p>
        <p class="bf-auth-popup-msg">Para curtir e interagir, você precisa estar logado.</p>
        <div class="bf-auth-popup-actions">
          <button class="bf-auth-popup-btn bf-auth-popup-btn--primary" data-goto="login">Entrar</button>
          <button class="bf-auth-popup-btn bf-auth-popup-btn--secondary" data-goto="cadastro">Cadastrar</button>
        </div>
        <div class="bf-auth-popup-bar"><div class="bf-auth-popup-bar-inner"></div></div>
      </div>`;

    // Navega ao clicar nos botões
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-goto]');
      if (!btn && e.target !== overlay) return;
      const dest = btn?.dataset.goto;
      overlay.remove();
      if (dest) {
        const router = typeof App !== 'undefined' ? App : null;
        if (router && typeof router.push === 'function') router.push(dest);
      }
    });

    document.body.appendChild(overlay);

    // Auto-dismiss em 3 segundos
    const timer = setTimeout(() => {
      overlay.classList.add('bf-auth-popup-overlay--saindo');
      setTimeout(() => overlay.remove(), 400);
    }, 3000);

    // Cancela o timer se o usuário clicar em qualquer botão
    overlay.addEventListener('click', () => clearTimeout(timer), { once: true });
  }

  // ── API pública ───────────────────────────────────────────

  /**
   * Verifica se o usuário está logado.
   * Se não logado: exibe aviso, redireciona para login e retorna false.
   * @param {object|null} router — instância do app (App ou Pro)
   * @returns {boolean}
   */
  function requireAuth(router) {
    if (_estaLogado()) return true;
    _mostrarAvisoLogin();
    if (router && typeof router.push === 'function') router.push('login');
    return false;
  }

  /**
   * Verifica se a navegação para `tela` é permitida sem autenticação.
   * Rotas públicas passam sempre. Rotas protegidas exigem login.
   * @param {string}      tela   — nome da tela (sem prefixo "tela-")
   * @param {object|null} router — instância do app
   * @returns {boolean} true = pode navegar | false = bloqueado + redirecionado
   */
  function permitirNav(tela, router) {
    // Fonte primária: Router.TELAS_PUBLICAS (lista branca — set estático do Router)
    // Telas públicas passam sempre, sem verificar login.
    // Qualquer outra tela exige autenticação.
    if (typeof Router !== 'undefined' && Router.TELAS_PUBLICAS instanceof Set) {
      if (Router.TELAS_PUBLICAS.has(tela)) return true;
      return requireAuth(router);
    }
    // Fallback: verifica Set de rotas protegidas por app (cliente / profissional)
    if (!_getRotas().has(tela)) return true;
    return requireAuth(router);
  }

  /**
   * Verifica se uma ação protegida pode ser executada.
   * @param {string}      acao   — valor do data-action
   * @param {object|null} router
   * @returns {boolean} true = permitido | false = bloqueado + popup
   */
  function permitirAcao(acao, router) {
    if (!ACOES_PROTEGIDAS.has(acao)) return true;
    if (_estaLogado()) return true;
    _mostrarAvisoLogin();
    return false;
  }

  return Object.freeze({ requireAuth, permitirNav, permitirAcao, ACOES_PROTEGIDAS });

})();

