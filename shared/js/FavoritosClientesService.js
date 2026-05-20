'use strict';

// =============================================================
// FavoritosClientesService.js — Lógica de listagem de clientes
// favoritos.
//
// Camada: application
//
// Responsabilidade ÚNICA: expor a lista de usuários que
// favoritaram uma barbearia ou seus barbeiros, em duas
// granularidades:
//
//   - listarPorBarbeiro(barbershopId, professionalId)
//       → favoritos da barbearia OU desse barbeiro específico.
//         Usado pela modal da cadeira (ClienteSeletorModal).
//
//   - listarPorBarbearia(barbershopId)
//       → favoritos da barbearia OU de QUALQUER barbeiro
//         vinculado a ela (professional_shop_links).
//         Usado no mslm-card (gestão de mensalistas, via BFF).
//
// Centraliza a regra em UM lugar para evitar duplicação entre
// a modal de cadeira e o mslm-card, garantindo que ninguém
// liste usuários do sistema sem vínculo de favorito.
//
// Dependências: UserRepository.js, InputValidator.js
//
// NOTA DE CAMADA: zero DOM, zero SQL direto. Delega ao
// UserRepository (infra) e devolve estruturas planas.
// =============================================================

class FavoritosClientesService {

  /**
   * Lista usuários favoritos relevantes à seleção de cliente
   * por UM barbeiro específico (modal da cadeira).
   *
   * Retorna quem favoritou a barbearia OU esse barbeiro.
   *
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<Array<{id:string, full_name:string, email:string|null, avatar_path:string|null, updated_at:string|null}>>}
   */
  static async listarPorBarbeiro(barbershopId, professionalId) {
    const rShop = InputValidator.uuid(barbershopId);
    const rProf = InputValidator.uuid(professionalId);
    if (!rShop.ok) throw new TypeError(`[FavoritosClientesService] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[FavoritosClientesService] professionalId: ${rProf.msg}`);

    const { data, error } = await BffApiService.mensalistas.favoritosModal(barbershopId, professionalId);
    if (error) throw error;

    return FavoritosClientesService.#normalizar(data);
  }

  /**
   * Lista usuários favoritos relevantes à barbearia inteira
   * (mslm-card / mensalistas).
   *
   * Retorna quem favoritou a barbearia OU qualquer barbeiro
   * vinculado a ela.
   *
   * @param {string} barbershopId
   * @returns {Promise<Array<{id:string, full_name:string, email:string|null, avatar_path:string|null, updated_at:string|null}>>}
   */
  static async listarPorBarbearia(barbershopId) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[FavoritosClientesService] barbershopId: ${r.msg}`);

    const { data, error } = await UserRepository.getFavoritosBarbearia(barbershopId);
    if (error) throw error;

    return FavoritosClientesService.#normalizar(data);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Normaliza o retorno do repositório para o formato público
   * consumido pelas telas (sempre array, sem nulls implícitos).
   *
   * @param {Array<object>|null|undefined} lista
   * @returns {Array<object>}
   */
  static #normalizar(lista) {
    return (lista ?? []).map(p => ({
      id:          p.id,
      full_name:   p.full_name   ?? 'Cliente',
      email:       p.email       ?? null,
      avatar_path: p.avatar_path ?? null,
      updated_at:  p.updated_at  ?? null,
    }));
  }
}
