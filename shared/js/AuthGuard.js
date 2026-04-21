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

  /** Mapa de mensagens contextuais por ação. */
  const _MSG_POPUP = Object.freeze({
    'like':                  'Para curtir stories, você precisa estar logado.',
    'barbershop-like':       'Para curtir barbearias, você precisa estar logado.',
    'barbershop-dislike':    'Para avaliar barbearias, você precisa estar logado.',
    'barbershop-favorite':   'Para favoritar barbearias, você precisa estar logado.',
    'professional-like':     'Para curtir barbeiros, você precisa estar logado.',
    'professional-favorite': 'Para favoritar barbeiros, você precisa estar logado.',
    'mensagem':              'Para enviar mensagens, você precisa estar logado.',
    'agendar':               'Para fazer agendamentos, você precisa estar logado.',
    'avatar-upload':         'Para alterar seu avatar, você precisa estar logado.',
  });

  /**
   * Exibe popup centralizada de login/cadastro por 3 segundos.
   * @param {string} [acao] — usado para mensagem contextual
   */
  function _mostrarAvisoLogin(acao) {
    const ID = '__bf-auth-popup';
    if (document.getElementById(ID)) return;  // já visível

    const msg = _MSG_POPUP[acao] ?? 'Para usar esta função, você precisa estar logado.';

    const overlay = document.createElement('div');
    overlay.id = ID;
    overlay.className = 'bf-auth-popup-overlay';

    // Conteúdo montado via DOM (sem innerHTML com variáveis dinâmicas de usuário)
    const card = document.createElement('div');
    card.className = 'bf-auth-popup';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Login necessário');

    const icon = document.createElement('div');
    icon.className = 'bf-auth-popup-icon';
    icon.textContent = '🔐';

    const title = document.createElement('p');
    title.className = 'bf-auth-popup-title';
    title.textContent = 'Acesso restrito';

    const body = document.createElement('p');
    body.className = 'bf-auth-popup-msg';
    body.textContent = msg;  // seguro: vem do mapa estático, nunca de input do usuário

    const actions = document.createElement('div');
    actions.className = 'bf-auth-popup-actions';

    const btnEnter = document.createElement('button');
    btnEnter.className = 'bf-auth-popup-btn bf-auth-popup-btn--primary';
    btnEnter.dataset.goto = 'login';
    btnEnter.textContent = 'Entrar';

    const btnReg = document.createElement('button');
    btnReg.className = 'bf-auth-popup-btn bf-auth-popup-btn--secondary';
    btnReg.dataset.goto = 'cadastro';
    btnReg.textContent = 'Cadastrar';

    actions.append(btnEnter, btnReg);

    // Botão fechar (X)
    const btnFechar = document.createElement('button');
    btnFechar.className = 'bf-auth-popup-btn-fechar';
    btnFechar.setAttribute('aria-label', 'Fechar');
    btnFechar.textContent = '✕';

    const bar = document.createElement('div');
    bar.className = 'bf-auth-popup-bar';
    const barInner = document.createElement('div');
    barInner.className = 'bf-auth-popup-bar-inner';
    bar.appendChild(barInner);

    card.append(btnFechar, icon, title, body, actions, bar);
    overlay.appendChild(card);

    // Auto-dismiss em 3 segundos
    const timer = setTimeout(() => {
      overlay.classList.add('bf-auth-popup-overlay--saindo');
      setTimeout(() => overlay.remove(), 400);
    }, 3000);

    /** Fecha o popup e cancela o timer pendente. */
    function _fechar(dest) {
      clearTimeout(timer);
      overlay.remove();
      if (dest) {
        // Suporta tanto o app cliente (App) quanto o profissional (Pro)
        const router = (typeof App !== 'undefined' ? App : null)
                    ?? (typeof Pro !== 'undefined' ? Pro : null);
        if (router && typeof router.push === 'function') router.push(dest);
      }
    }

    // Fecha ao clicar nos botões de navegação ou no fundo escuro
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-goto]');
      if (btn) { _fechar(btn.dataset.goto); return; }
      if (e.target === overlay) _fechar(null);
    });

    // Fecha ao clicar no botão X
    btnFechar.addEventListener('click', () => _fechar(null));

    document.body.appendChild(overlay);
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
    _mostrarAvisoLogin(acao);
    return false;
  }

  return Object.freeze({ requireAuth, permitirNav, permitirAcao, ACOES_PROTEGIDAS });

})();

