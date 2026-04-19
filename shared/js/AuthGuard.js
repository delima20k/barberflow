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
//   ✔ Visitante pode: home, pesquisa, ver barbearias, ver barbeiros
//   ✗ Visitante NÃO pode: agendar, mensagem, favoritar, pagamento, like
//
// Dependências: AppState.js (carregado antes deste arquivo)
// =============================================================

const AuthGuard = (() => {

  // ── Rotas protegidas por app ───────────────────────────────

  const _ROTAS_CLIENTE = new Set([
    'mensagens',
    'favoritas',
    'perfil',
    'sair',
  ]);

  const _ROTAS_PRO = new Set([
    'mensagens',
    'minha-barbearia',
    'perfil',
    'sair',
    'agenda',
  ]);

  // ── Ações protegidas (data-action values) ─────────────────

  /**
   * Set de data-action values que exigem autenticação.
   * Interceptado pelo Router._bindDataAttributes e pelas Pages.
   */
  const ACOES_PROTEGIDAS = Object.freeze(new Set([
    'agendar',
    'mensagem',
    'barbershop-favorite',
    'pagamento',
    'like',
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

  // ── API pública ───────────────────────────────────────────

  /**
   * Verifica se o usuário está logado.
   * Se não logado: redireciona para login via push() e retorna false.
   * @param {Router} router — instância do app (App ou Pro)
   * @returns {boolean}
   */
  function requireAuth(router) {
    if (typeof AppState !== 'undefined' && AppState.isLogged()) return true;
    if (router && typeof router.push === 'function') router.push('login');
    return false;
  }

  /**
   * Verifica se a navegação para `tela` é permitida sem autenticação.
   * Rotas públicas passam sempre. Rotas protegidas exigem login.
   * @param {string} tela — nome da tela (sem prefixo "tela-")
   * @param {Router} router
   * @returns {boolean} true = pode navegar | false = bloqueado + redirecionado
   */
  function permitirNav(tela, router) {
    if (!_getRotas().has(tela)) return true;
    return requireAuth(router);
  }

  /**
   * Verifica se uma ação protegida pode ser executada.
   * @param {string} acao — valor do data-action
   * @param {Router} router
   * @returns {boolean} true = permitido | false = bloqueado + redirecionado
   */
  function permitirAcao(acao, router) {
    if (!ACOES_PROTEGIDAS.has(acao)) return true;
    return requireAuth(router);
  }

  return Object.freeze({ requireAuth, permitirNav, permitirAcao, ACOES_PROTEGIDAS });

})();
