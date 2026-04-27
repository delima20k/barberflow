'use strict';

// =============================================================
// UserService.js — Regras de negócio transversais de usuário.
// Camada: application
//
// Responsável por operações cross-cutting sobre usuários:
//   - busca por e-mail (find-by-email via RPC seguro)
//   - perfil público
//
// Nunca acessa o banco diretamente — delega ao ClienteRepository.
// =============================================================

const BaseService = require('../infra/BaseService');

class UserService extends BaseService {

  #clienteRepository;

  /** @param {import('../repositories/ClienteRepository')} clienteRepository */
  constructor(clienteRepository) {
    super('UserService');
    this.#clienteRepository = clienteRepository;
  }

  /**
   * Busca um usuário pelo e-mail.
   * Usa RPC segura (sem interpolação) para evitar SQL/PostgREST injection.
   * @param {string} email
   * @returns {Promise<object>}
   */
  async buscarPorEmail(email) {
    this._email('email', email);

    const perfil = await this.#clienteRepository.findByEmail(email);
    if (!perfil) throw this._erro('Usuário não encontrado.', 404);

    return perfil;
  }

  /**
   * Busca o perfil público de um usuário (sem dados sensíveis).
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async buscarPerfilPublico(userId) {
    this._uuid('userId', userId);

    const perfil = await this.#clienteRepository.getPerfilPublico(userId);
    if (!perfil) throw this._erro('Usuário não encontrado.', 404);

    return perfil;
  }
}

module.exports = UserService;
