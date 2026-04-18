'use strict';

// =============================================================
// LogoutPage.js — Página de Saída do app cliente.
// Responsabilidade: estrutura declarativa da tela de logout.
// A confirmação de saída usa data-action="confirmar-saida" no HTML,
// tratado diretamente pelo Router._bindDataAttributes — sem código
// extra necessário aqui.
//
// A classe existe para documentar a responsabilidade e permitir
// extensão futura (ex: feedback de logout, analytics de sessão).
// =============================================================

// Representa a tela de logout — lógica de confirmação no Router via data-action.
class LogoutPage {

  constructor() {}

  /**
   * Sem listeners adicionais — o botão de confirmação usa
   * data-action="confirmar-saida" e é tratado pelo Router.
   * Mantido para consistência arquitetural e extensibilidade.
   */
  bind() {
    // A ação de confirmar saída é delegada ao Router via data-action="confirmar-saida"
    // registrado em Router._bindDataAttributes(). Nenhum bind extra necessário.
  }
}
