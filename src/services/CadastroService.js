'use strict';

// =============================================================
// CadastroService.js — Regras de negócio de cadastro de perfil.
// Camada: application
//
// Responsável pela criação de perfil pós-signUp do Supabase Auth.
// Nunca acessa o banco diretamente — delega ao AuthRepository.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class CadastroService {

  #authRepository;

  /** @param {import('../repositories/AuthRepository')} authRepository */
  constructor(authRepository) {
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
    const rId = InputValidator.uuid(userId ?? '');
    if (!rId.ok) throw Object.assign(new Error('userId inválido.'), { status: 400 });

    const rNome = InputValidator.nome(dados?.full_name ?? '');
    if (!rNome.ok) throw Object.assign(new Error(`full_name: ${rNome.msg}`), { status: 400 });

    if (dados?.phone) {
      const rTel = InputValidator.telefone(dados.phone);
      if (!rTel.ok) throw Object.assign(new Error(`phone: ${rTel.msg}`), { status: 400 });
    }

    const perfil = await this.#authRepository.criarPerfil(userId, {
      full_name: dados.full_name.trim(),
      phone:     dados.phone ?? null,
    });

    // Cria barbearia apenas para dono de barbearia com nome informado
    let barbearia = null;
    if (dados.pro_type === 'barbearia' && dados.barbearia?.trim()) {
      const rBarb = InputValidator.textoLivre(dados.barbearia, 100, true);
      if (!rBarb.ok) throw Object.assign(new Error(`barbearia: ${rBarb.msg}`), { status: 400 });

      barbearia = await this.#authRepository.criarBarbearia(userId, rBarb.valor);
    }

    return { perfil, barbearia };
  }

  /**
   * Busca perfil público de um usuário.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async buscarPerfilPublico(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#authRepository.getPerfilPublico(userId);
  }
}

module.exports = CadastroService;
