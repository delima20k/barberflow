'use strict';

// =============================================================
// ClienteService.js — Regras de negócio para o perfil do cliente.
// Orquestra operações sobre o domínio cliente, mantendo cache em
// memória para evitar re-fetches desnecessários.
//
// Nunca acessa o banco diretamente — delega ao ClienteRepository.
// Dependências: ClienteRepository.js, Cliente.js
// =============================================================

class ClienteService {

  // Perfil em memória — preenchido na 1ª carga, invalidado no logout/update
  static #cache = null;

  // ═══════════════════════════════════════════════════════════
  // PERFIL
  // ═══════════════════════════════════════════════════════════

  /**
   * Carrega o perfil do cliente, usando cache se disponível.
   * @param {string} userId
   * @returns {Promise<Cliente>}
   */
  static async carregarPerfil(userId) {
    if (ClienteService.#cache?.id === userId) return ClienteService.#cache;

    const row = await ClienteRepository.getById(userId);
    const cliente = Cliente.fromRow(row);
    ClienteService.#cache = cliente;
    return cliente;
  }

  /**
   * Atualiza dados do perfil e invalida o cache.
   * @param {string} userId
   * @param {object} dados — campos a atualizar (allowlist aplicada no repo)
   * @returns {Promise<void>}
   */
  static async atualizarPerfil(userId, dados) {
    await ClienteRepository.update(userId, dados);
    ClienteService.#cache = null;
  }

  // ═══════════════════════════════════════════════════════════
  // FAVORITOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna barbearias favoritas do cliente.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  static async carregarFavoritos(userId) {
    return ClienteRepository.getFavoritos(userId);
  }

  // ═══════════════════════════════════════════════════════════
  // HISTÓRICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna histórico de agendamentos do cliente.
   * @param {string} userId
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  static async carregarHistorico(userId, limit = 20) {
    return ClienteRepository.getHistorico(userId, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // CACHE
  // ═══════════════════════════════════════════════════════════

  /**
   * Limpa o cache em memória.
   * Deve ser chamado no logout para garantir que a próxima sessão
   * carregue um perfil fresco.
   */
  static limparCache() {
    ClienteService.#cache = null;
  }
}
