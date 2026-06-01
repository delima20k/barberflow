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
//                       e consulta o status de mensalista antes de abrir,
//                       garantindo paridade com o app profissional.
//
// Dependências: CorteModal.js, AuthService.js, BffApiService.js
// =============================================================

class ModalController {

  /**
   * Abre o modal de seleção de serviços para o cliente logado.
   * O nome do cliente é resolvido automaticamente via AuthService
   * e o status de mensalista via BFF (best-effort, fallback false).
   *
   * @param {object}        opts
   * @param {object[]}      opts.servicos      lista de serviços da barbearia
   * @param {string|null}   [opts.barbershopId] barbearia atual — necessário para
   *                                            consultar status de mensalista
   * @returns {Promise<string[]|null>} IDs selecionados, ou null se cancelado
   */
  static async abrirSelecaoServicos({ servicos, barbershopId = null }) {
    const perfil      = (typeof AuthService !== 'undefined') ? AuthService.getPerfil() : null;
    const clienteNome = perfil?.full_name ?? 'você';
    const clienteMensalista =
      await ModalController.#consultarMensalismo(barbershopId, perfil?.id ?? null);

    return CorteModal.abrir({ servicos, clienteNome, clienteMensalista });
  }

  /**
   * Best-effort: consulta se o cliente logado é mensalista da barbearia.
   * Retorna false em qualquer falha (rede, anônimo, BFF indisponível).
   *
   * @param {string|null} barbershopId
   * @param {string|null} clientId
   * @returns {Promise<boolean>}
   */
  static async #consultarMensalismo(barbershopId, clientId) {
    if (!barbershopId || !clientId) return false;
    if (typeof BffApiService === 'undefined') return false;
    try {
      const { data, error } = await BffApiService.mensalistas.verificar(barbershopId, clientId);
      if (error) return false;
      return Boolean(data?.ativo);
    } catch {
      return false;
    }
  }
}
