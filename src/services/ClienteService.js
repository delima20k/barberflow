'use strict';

// =============================================================
// ClienteService.js — Regras de negócio para clientes.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ClienteRepository.
// Contém validação de negócio e orquestração.
// =============================================================

const Cliente        = require('../entities/Cliente');
const InputValidator = require('../infra/InputValidator');

class ClienteService {

  #clienteRepository;

  /** @param {import('../repositories/ClienteRepository')} clienteRepository */
  constructor(clienteRepository) {
    this.#clienteRepository = clienteRepository;
  }

  /**
   * Busca os dados de um cliente pelo ID.
   * @param {string} id — UUID do perfil
   * @returns {Promise<Cliente>}
   */
  async buscarCliente(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const row = await this.#clienteRepository.getById(id);
    if (!row) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });

    return Cliente.fromRow(row);
  }

  /**
   * Atualiza dados do perfil do cliente.
   * Apenas o próprio cliente pode atualizar seus dados (verificado pelo controller).
   * @param {string} id      — UUID do perfil
   * @param {object} dados   — campos a atualizar
   * @param {string} userId  — ID do usuário autenticado (autorização)
   * @returns {Promise<Cliente>}
   */
  async atualizarCliente(id, dados, userId) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    // Regra de negócio: cliente só pode editar o próprio perfil
    if (id !== userId) {
      throw Object.assign(new Error('Não autorizado a editar este perfil.'), { status: 403 });
    }

    // Valida campos de texto livre antes de persistir
    if ('bio' in dados) {
      const r = InputValidator.textoLivre(dados.bio, 300);
      if (!r.ok) throw Object.assign(new Error(`bio: ${r.msg}`), { status: 400 });
      dados.bio = r.valor;
    }
    if ('address' in dados) {
      const r = InputValidator.textoLivre(dados.address, 200);
      if (!r.ok) throw Object.assign(new Error(`address: ${r.msg}`), { status: 400 });
      dados.address = r.valor;
    }
    if ('full_name' in dados) {
      const r = InputValidator.nome(dados.full_name);
      if (!r.ok) throw Object.assign(new Error(`full_name: ${r.msg}`), { status: 400 });
    }
    if ('phone' in dados && dados.phone) {
      const r = InputValidator.telefone(dados.phone);
      if (!r.ok) throw Object.assign(new Error(`phone: ${r.msg}`), { status: 400 });
    }

    const row = await this.#clienteRepository.update(id, dados);
    return Cliente.fromRow(row);
  }

  /**
   * Busca o perfil público de um usuário (sem dados sensíveis).
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async buscarPerfilPublico(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#clienteRepository.getPerfilPublico(id);
  }
}

module.exports = ClienteService;
