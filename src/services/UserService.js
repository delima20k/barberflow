'use strict';

// =============================================================
// UserService.js — Regras de negócio transversais de usuário.
// Camada: application
//
// Responsável por operações cross-cutting sobre usuários:
//   - busca por e-mail (find-by-email via RPC seguro)
//   - perfil público
//   - busca unificada (nome / email / barbearia) com paginação
//   - clientes favoritos do barbeiro
//
// Nunca acessa o banco diretamente — delega aos repositórios.
// =============================================================

const BaseService = require('../infra/BaseService');

/** Limite máximo aceito pelo serviço (barreira de negócio). */
const LIMITE_MAXIMO = 50;

class UserService extends BaseService {

  #clienteRepository;
  #searchRepository;

  /**
   * @param {import('../repositories/ClienteRepository')} clienteRepository
   * @param {import('../repositories/SearchRepository')}  searchRepository
   */
  constructor(clienteRepository, searchRepository) {
    super('UserService');
    this.#clienteRepository = clienteRepository;
    this.#searchRepository  = searchRepository ?? null;
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

  // ═══════════════════════════════════════════════════════════
  // Busca unificada (SearchRepository)
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca unificada de usuários: por nome, e-mail ou nome da barbearia.
   * Quando não há termo, retorna os favoritos do barbeiro informado.
   *
   * Regras:
   *   - term presente          → busca via RPC search_users (1 query com JOIN)
   *   - term ausente + barberIds → retorna favoritos via RPC get_clientes_favoritos_modal
   *   - nenhum dos dois        → lança 400
   *
   * @param {object}      filters
   * @param {string}      [filters.term]           — texto a buscar
   * @param {string|null} [filters.role]            — 'client' | 'professional' | null
   * @param {number}      [filters.limit=20]        — resultados por página (máx 50)
   * @param {number}      [filters.offset=0]        — deslocamento de paginação
   * @param {string}      [filters.barbershopId]    — UUID da barbearia (sem term)
   * @param {string}      [filters.professionalId]  — UUID do barbeiro   (sem term)
   * @returns {Promise<{ itens: object[], total: number }>}
   */
  async searchUsers({
    term,
    role         = null,
    limit        = 20,
    offset       = 0,
    barbershopId = null,
    professionalId = null,
  } = {}) {
    if (!this.#searchRepository) {
      throw this._erro('SearchRepository não configurado.', 500);
    }

    const termNorm = typeof term === 'string' ? term.trim() : '';
    const lim      = Math.min(Math.max(1, Number(limit)  || 20), LIMITE_MAXIMO);
    const off      = Math.max(0, Number(offset) || 0);

    if (termNorm) {
      // Busca textual — nome, e-mail ou nome da barbearia
      return this.#searchRepository.searchUsers({
        term:   termNorm,
        role:   role ?? null,
        limit:  lim,
        offset: off,
      });
    }

    if (barbershopId && professionalId) {
      // Sem texto → retorna favoritos do barbeiro
      this._uuid('barbershopId',   barbershopId);
      this._uuid('professionalId', professionalId);
      return this.#searchRepository.getFavoriteClients(barbershopId, professionalId);
    }
    throw this._erro(
      'Informe um termo de busca ou os IDs da barbearia e do barbeiro.',
      400
    );
  }
}

module.exports = UserService;
