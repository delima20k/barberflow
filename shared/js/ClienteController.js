'use strict';

// =============================================================
// ClienteController.js — Autorização e ações de cliente na fila.
//
// Responsabilidade ÚNICA: verificar se o usuário logado tem o
// perfil de cliente e orquestrar sua entrada na fila de
// atendimento.
//
// CAMADA: application — sem acesso ao DOM.
// Quem chama (interfaces) é responsável por re-renders e toasts.
//
// Regra de permissão:
//   role === 'client' + autenticado → pode interagir
//   role === 'professional'          → NÃO pode (apenas visitante)
//   não autenticado                  → NÃO pode
//
// Dependências: AuthService.js, FilaController.js
// =============================================================

class ClienteController {

  // ═══════════════════════════════════════════════════════════
  // AUTORIZAÇÃO
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário logado pode interagir com as cadeiras
   * (entrar na fila, selecionar serviços etc.).
   *
   * Profissionais que navegam pelo app como visitantes são
   * explicitamente excluídos: dono interage pela própria tela.
   *
   * @returns {boolean}
   */
  static podeInteragir() {
    const perfil = (typeof AuthService !== 'undefined') ? AuthService.getPerfil() : null;
    return !!perfil?.id && perfil.role === 'client';
  }

  // ═══════════════════════════════════════════════════════════
  // AÇÕES
  // ═══════════════════════════════════════════════════════════

  /**
   * Entra na fila de atendimento de um barbeiro.
   * Valida role antes de delegar ao FilaController.
   *
   * @param {object}   opts
   * @param {string}     opts.barbershopId
   * @param {string}     [opts.professionalId]   barbeiro preferido
   * @param {string[]}   [opts.serviceIds]        serviços escolhidos
   * @returns {Promise<object>} entrada criada
   * @throws {Error} se usuário não tiver permissão
   */
  static async entrarNaFila({ barbershopId, professionalId = null, serviceIds = [] }) {
    if (!ClienteController.podeInteragir()) {
      throw new Error('[ClienteController] Acesso negado: apenas clientes autenticados podem entrar na fila.');
    }

    const perfil = AuthService.getPerfil();

    return FilaController.entrarNaFila({
      barbershopId,
      clientId:      perfil.id,
      professionalId,
      serviceIds,
    });
  }
}
