'use strict';

// =============================================================
// ClienteService.js — Regras de negócio para clientes.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ClienteRepository.
// Contém validação de negócio e orquestração.
// =============================================================

const Cliente     = require('../entities/Cliente');
const BaseService = require('../infra/BaseService');

class ClienteService extends BaseService {

  #clienteRepository;

  /** @param {import('../repositories/ClienteRepository')} clienteRepository */
  constructor(clienteRepository) {
    super('ClienteService');
    this.#clienteRepository = clienteRepository;
  }

  /**
   * Busca os dados de um cliente pelo ID.
   * @param {string} id — UUID do perfil
   * @returns {Promise<Cliente>}
   */
  async buscarCliente(id) {
    this._uuid('id', id);

    const row = await this.#clienteRepository.getById(id);
    if (!row) throw this._erro('Cliente não encontrado.', 404);

    return Cliente.fromRow(row);
  }

  /**
   * Atualiza dados do perfil do cliente.
   * Apenas o próprio cliente pode atualizar seus dados.
   * @param {string} id      — UUID do perfil
   * @param {object} dados   — campos a atualizar
   * @param {string} userId  — ID do usuário autenticado (autorização)
   * @returns {Promise<Cliente>}
   */
  async atualizarCliente(id, dados, userId) {
    this._uuid('id', id);

    // Regra de negócio: cliente só pode editar o próprio perfil
    if (id !== userId) throw this._erro('Não autorizado a editar este perfil.', 403);

    // Valida campos de texto livre antes de persistir
    if ('bio' in dados)      dados.bio      = this._texto('bio',     dados.bio,     300);
    if ('address' in dados)  dados.address  = this._texto('address', dados.address, 200);
    if ('full_name' in dados) this._nome('full_name', dados.full_name);
    if ('phone' in dados && dados.phone) this._telefone('phone', dados.phone);

    const row = await this.#clienteRepository.update(id, dados);
    return Cliente.fromRow(row);
  }

  /**
   * Busca o perfil público de um usuário (sem dados sensíveis).
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async buscarPerfilPublico(id) {
    this._uuid('id', id);
    return this.#clienteRepository.getPerfilPublico(id);
  }
}

module.exports = ClienteService;
