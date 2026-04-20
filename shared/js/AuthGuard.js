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

  /** Exibe um toast leve de "faça login para interagir" (não bloqueia). */
  function _mostrarAvisoLogin() {
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Login necessário',
        'Faça login para interagir',
        'info'
      );
      return;
    }
    // Fallback nativo quando NotificationService não está disponível
    const id = '__auth-guard-toast';
    if (document.getElementById(id)) return;
    const el = document.createElement('div');
    el.id            = id;
    el.textContent   = 'Faça login para interagir';
    el.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,.82)',
      'color:#fff',
      'padding:.55rem 1.2rem',
      'border-radius:2rem',
      'font-size:.88rem',
      'z-index:9999',
      'pointer-events:none',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
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
   * @returns {boolean} true = permitido | false = bloqueado + redirecionado
   */
  function permitirAcao(acao, router) {
    if (!ACOES_PROTEGIDAS.has(acao)) return true;
    return requireAuth(router);
  }

  return Object.freeze({ requireAuth, permitirNav, permitirAcao, ACOES_PROTEGIDAS });

})();

