'use strict';

// =============================================================
// CadastroService.js — Regras de negócio de cadastro de perfil.
// Camada: application
//
// Responsável pela criação de perfil pós-signUp do Supabase Auth.
// Nunca acessa o banco diretamente — delega ao AuthRepository.
// =============================================================

const InputValidator = require('../infra/InputValidator');
const BaseService    = require('../infra/BaseService');

class CadastroService extends BaseService {

  #authRepository;

  /** @param {import('../repositories/AuthRepository')} authRepository */
  constructor(authRepository) {
    super('CadastroService');
    this.#authRepository = authRepository;
  }

  /**
   * Cria (ou garante a existência de) um perfil pós-signUp.
   * - Sempre faz upsert do perfil básico.
   * - Se pro_type === 'barbearia' e barbearia informado, cria barbershop.
   *
   * @param {string} userId
   * @param {{
   *   full_name: string,
   *   phone?:    string|null,
   *   role?:     'client'|'professional',
   *   pro_type?: string|null,
   *   barbearia?: string|null
   * }} dados
   * @returns {Promise<{ perfil: object, barbearia: object|null }>}
   */
  async cadastrarPerfil(userId, dados) {
    this._uuid('userId', userId ?? '');

    const rNome = InputValidator.nome(dados?.full_name ?? '');
    if (!rNome.ok) throw this._erro(`full_name: ${rNome.msg}`);

    if (dados?.phone) {
      const rTel = InputValidator.telefone(dados.phone);
      if (!rTel.ok) throw this._erro(`phone: ${rTel.msg}`);
    }

    const perfil = await this.#authRepository.criarPerfil(userId, {
      full_name: dados.full_name.trim(),
      phone:     dados.phone ?? null,
    });

    // Cria barbearia apenas para dono de barbearia com nome informado
    let barbearia = null;
    if (dados.pro_type === 'barbearia' && dados.barbearia?.trim()) {
      const nomeBarbearia = this._texto('barbearia', dados.barbearia, 100, true);
      barbearia = await this.#authRepository.criarBarbearia(userId, nomeBarbearia);
    }

    return { perfil, barbearia };
  }

  /**
   * Busca perfil público de um usuário.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async buscarPerfilPublico(userId) {
    this._uuid('userId', userId);
    return this.#authRepository.getPerfilPublico(userId);
  }
}

module.exports = CadastroService;
