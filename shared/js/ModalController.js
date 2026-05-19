'use strict';

// =============================================================
// ModalController.js — Adapter de modais para o contexto cliente.
//
// Responsabilidade ÚNICA: abrir modais de seleção no contexto do
// cliente autenticado, resolvendo o nome automaticamente e
// delegando a renderização ao componente correto.
//
// CAMADA: interfaces — encapsula CorteModal para o contexto cliente.
//
// Diferença de CorteModal:
//   CorteModal        — componente genérico (requer clienteNome explícito)
//   ModalController   — usa o perfil do usuário logado como clienteNome
//
// Dependências: CorteModal.js, AuthService.js
// =============================================================

class ModalController {

  /**
   * Abre o modal de seleção de serviços para o cliente logado.
   * O nome do cliente é resolvido automaticamente via AuthService.
   *
   * @param {object}   opts
   * @param {object[]} opts.servicos   lista de serviços da barbearia
   * @returns {Promise<string[]|null>} IDs selecionados, ou null se cancelado
   */
  static async abrirSelecaoServicos({ servicos }) {
    const perfil     = (typeof AuthService !== 'undefined') ? AuthService.getPerfil() : null;
    const clienteNome = perfil?.full_name ?? 'você';
    return CorteModal.abrir({ servicos, clienteNome });
  }
}
