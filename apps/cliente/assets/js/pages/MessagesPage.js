'use strict';

// =============================================================
// MessagesPage.js — Página de Mensagens do app cliente.
// Responsabilidade: registrar o MessagesWidget com os parâmetros
// corretos do app cliente. A lógica de renderização e Realtime
// fica no MessagesWidget — não aqui.
//
// Dependências: MessagesWidget.js (shared)
// =============================================================

// Gerencia a tela de mensagens: inicializa o widget de chat para o papel cliente.
class MessagesPage {

  constructor() {}

  /**
   * Inicializa o MessagesWidget para o app cliente.
   * Chame uma vez via AppBootstrap (DOM já está disponível).
   */
  bind() {
    if (typeof MessagesWidget === 'undefined') return;
    MessagesWidget.init('msgs-lista', 'cliente');
  }
}
