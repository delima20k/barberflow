'use strict';

// =============================================================
// MessagesWidget.js — Shim de compatibilidade (interfaces)
//
// A lógica foi migrada para:
//   UniversalChatPage — lista de conversas e favoritos
//   ChatModal         — tela de chat ao vivo
//   ChatSearchWidget  — busca de usuários
//
// Este arquivo preserva a interface pública para que os onclick
// nos dois index.html continuem funcionando sem alteração:
//   MessagesWidget.init(listaId, role)
//   MessagesWidget.abrirModal(convId)
//   MessagesWidget.fecharModal()
//   MessagesWidget.enviar()
// =============================================================

class MessagesWidget {

  /** @deprecated — consulte UniversalChatPage.#conversas diretamente */
  static #conversa = null;

  // ══════════════════════════════════════════════════════════
  // INTERFACE PÚBLICA — preservada para retrocompatibilidade
  // ══════════════════════════════════════════════════════════

  /**
   * Inicializa a página de mensagens.
   * Delega para UniversalChatPage que gerencia lista, favoritos e busca.
   *
   * @param {string} listaId — id do container de cards (ex: 'msgs-lista')
   * @param {string} role    — 'cliente' | 'profissional'
   */
  static init(listaId, role = 'cliente') {
    UniversalChatPage.init(listaId, role);
  }

  /**
   * Abre o chat para a conversa/peer indicado.
   * @param {string} convId — UUID da conversa ou peerId
   */
  static async abrirModal(convId) {
    await UniversalChatPage.abrirModal(convId);
  }

  /** Fecha o chat ativo e volta para a tela de mensagens. */
  static fecharModal() {
    ChatModal.fechar();
  }

  /** Envia a mensagem digitada no input do chat. */
  static async enviar() {
    await ChatModal.enviar();
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS LEGADOS — usados externamente por BarbeiroPage,
  // BarbeariaPage e fluxos de convite via sessionStorage
  // ══════════════════════════════════════════════════════════

  /**
   * Abre o chat a partir de um convite persistido em sessionStorage.
   * Chamado via BarbeariaPage e BarbeiroPage após navegar para mensagens.
   * @param {string} conversationId
   */
  static async abrirConversaPersistida(conversationId) {
    if (!conversationId) return;
    await UniversalChatPage.abrirModal(conversationId);
  }
}
