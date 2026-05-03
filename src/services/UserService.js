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

  /**
   * Busca perfis por nome. Usado no modal de seleção de cliente (profissional).
   * @param {string} termo
   * @param {number} [limite=20]
   * @returns {Promise<object[]>}
   */
  async buscarPorNome(termo, limite = 20) {
    if (!termo || typeof termo !== 'string' || !termo.trim()) {
      throw this._erro('Termo de busca inválido.', 400);
    }
    return this.#clienteRepository.buscarPorNome(termo.trim(), limite);
  }

  /**
   * Retorna perfis de quem favoritou a barbearia ou o barbeiro.
   * Usado no modal de seleção de cliente.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async getClientesFavoritosModal(barbershopId, professionalId) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('professionalId', professionalId);
    return this.#clienteRepository.getClientesFavoritosModal(barbershopId, professionalId);
  }
}

module.exports = UserService;
