'use strict';

// =============================================================
// PermissionService.js — Controle semântico de permissões de UI.
//
// Responsabilidade:
//   Centralizar a verificação de permissões para ações do usuário.
//   Todo "o usuário pode fazer X?" passa por aqui — nunca if espalhado.
//
// Diferença de AuthGuard:
//   AuthGuard → guarda navegação entre telas e data-actions do Router.
//   PermissionService → responde a perguntas semânticas de UI:
//     "posso agendar?", "posso enviar mensagem?", "posso interagir?"
//
// Regras de negócio:
//   Visitante (não logado):
//     ✔ Navegar e visualizar conteúdo
//     ✗ Agendar, enviar mensagem, interagir (like, fila, favorito, etc.)
//
//   Logado:
//     ✔ Acesso completo
//
// Dependências (carregadas antes):
//   AppState.js
// =============================================================

const PermissionService = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // SCHEMA DE PERMISSÕES
  // Cada entrada: { exigeAuth: boolean, alerta: string }
  // ═══════════════════════════════════════════════════════════

  const _PERMISSOES = Object.freeze({
    agendar:    { exigeAuth: true,  alerta: 'Faça login para agendar um horário.' },
    mensagem:   { exigeAuth: true,  alerta: 'Faça login para enviar mensagens.' },
    interagir:  { exigeAuth: true,  alerta: 'Faça login para curtir e interagir.' },
    fila:       { exigeAuth: true,  alerta: 'Faça login para entrar na fila.' },
    favoritar:  { exigeAuth: true,  alerta: 'Faça login para salvar favoritos.' },
    pagamento:  { exigeAuth: true,  alerta: 'Faça login para realizar pagamentos.' },
    visualizar: { exigeAuth: false, alerta: null }, // sempre permitido
  });

  // ═══════════════════════════════════════════════════════════
  // NÚCLEO — verificação centralizada
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica se a ação é permitida para o usuário atual.
   * Fonte única de toda decisão de permissão no app.
   *
   * @param {string} acao — chave do schema _PERMISSOES
   * @param {object} [opts]
   * @param {Router}  [opts.router]  — se fornecido, redireciona para 'login' ao bloquear
   * @param {boolean} [opts.alerta]  — se true, exibe alert() ao bloquear (padrão: true quando sem router)
   * @returns {boolean} true = permitido | false = bloqueado
   *
   * @example
   *   // Redireciona para login se bloqueado:
   *   if (!PermissionService.verificar('agendar', { router: App })) return;
   *
   *   // Só mostra alerta (sem redirecionar):
   *   if (!PermissionService.verificar('interagir', { alerta: true })) return;
   */
  function verificar(acao, opts = {}) {
    const permissao = _PERMISSOES[acao];

    if (!permissao) {
      console.warn(`[PermissionService] Ação desconhecida: "${acao}". Bloqueado por segurança.`);
      return false;
    }

    if (!permissao.exigeAuth) return true;

    const logado = typeof AppState !== 'undefined' && AppState.isLogged();
    if (logado) return true;

    // Bloqueado — escolhe o modo de resposta
    const { router, alerta } = opts;

    if (router && typeof router.push === 'function') {
      router.push('login');
    } else if (alerta !== false) {
      // alerta padrão quando não há router — nunca silencia sem intenção explícita
      alert(permissao.alerta);
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════
  // API SEMÂNTICA — métodos nomeados por intenção
  // Cada método delega para verificar() — lógica em ponto único.
  // ═══════════════════════════════════════════════════════════

  /**
   * Usuário pode agendar um horário?
   * @param {{ router?: Router, alerta?: boolean }} [opts]
   * @returns {boolean}
   * @example
   *   if (!PermissionService.canSchedule({ router: App })) return;
   */
  function canSchedule(opts)   { return verificar('agendar',  opts); }

  /**
   * Usuário pode enviar ou ler mensagens?
   * @param {{ router?: Router, alerta?: boolean }} [opts]
   * @returns {boolean}
   */
  function canMessage(opts)    { return verificar('mensagem', opts); }

  /**
   * Usuário pode interagir? (like, fila, qualquer ação social)
   * @param {{ router?: Router, alerta?: boolean }} [opts]
   * @returns {boolean}
   */
  function canInteract(opts)   { return verificar('interagir', opts); }

  /**
   * Usuário pode entrar na fila?
   * @param {{ router?: Router, alerta?: boolean }} [opts]
   * @returns {boolean}
   */
  function canQueue(opts)      { return verificar('fila', opts); }

  /**
   * Usuário pode salvar favoritos?
   * @param {{ router?: Router, alerta?: boolean }} [opts]
   * @returns {boolean}
   */
  function canFavorite(opts)   { return verificar('favoritar', opts); }

  /**
   * Usuário pode realizar pagamento?
   * @param {{ router?: Router, alerta?: boolean }} [opts]
   * @returns {boolean}
   */
  function canPay(opts)        { return verificar('pagamento', opts); }

  /**
   * Retorna true — visualização é sempre permitida (visitantes inclusos).
   * Existe para padronizar verificações no código mesmo quando sempre true.
   * @returns {boolean}
   */
  function canView()           { return true; }

  return Object.freeze({
    verificar,
    canSchedule,
    canMessage,
    canInteract,
    canQueue,
    canFavorite,
    canPay,
    canView,
  });
})();
