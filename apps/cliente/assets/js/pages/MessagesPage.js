'use strict';

// =============================================================
// MessagesPage.js — Página de Mensagens do app cliente.
// Responsabilidade: apenas delegar ao MessagesWidget compartilhado.
// A inicialização completa (DOM + MutationObserver) é feita via
// AppBootstrap.init() — NUNCA chamar MessagesWidget.init() aqui
// para não duplicar observers e causar comportamentos diferentes
// do app profissional.
//
// Dependências: MessagesWidget.js (shared)
// =============================================================
class MessagesPage {
  constructor() {}

  // bind() é mantido para compatibilidade com o loop de app.js,
  // mas não executa o init (AppBootstrap cuida disso).
  bind() {}
}
