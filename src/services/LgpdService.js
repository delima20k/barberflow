'use strict';

// =============================================================
// LgpdService.js — Regras de negócio de dados LGPD.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao LgpdRepository.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class LgpdService {

  #lgpdRepository;

  /** @param {import('../repositories/LgpdRepository')} lgpdRepository */
  constructor(lgpdRepository) {
    this.#lgpdRepository = lgpdRepository;
  }

  /**
   * Verifica se o usuário tem consentimento registrado.
   * @param {string} userId
   * @returns {Promise<{ aceitou: boolean, dados: object|null }>}
   */
  async verificarConsentimento(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const aceite = await this.#lgpdRepository.verificarAceite(userId);
    return { aceitou: aceite !== null, dados: aceite };
  }

  /**
   * Registra aceite dos termos.
   * @param {string} userId
   * @param {{ version: string, ip?: string, user_agent?: string }} dados
   * @returns {Promise<object>}
   */
  async registrarConsentimento(userId, dados) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    if (!dados?.version?.trim())
      throw Object.assign(new Error('version é obrigatório.'), { status: 400 });

    return this.#lgpdRepository.registrarAceite(userId, dados);
  }

  /**
   * Solicita exclusão de dados (LGPD Art. 18, VI).
   * @param {string} userId
   * @param {string} motivo
   * @returns {Promise<object>}
   */
  async solicitarExclusaoDados(userId, motivo) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const rMot = InputValidator.textoLivre(motivo ?? '', 1000, true);
    if (!rMot.ok) throw Object.assign(new Error(`motivo: ${rMot.msg}`), { status: 400 });

    return this.#lgpdRepository.solicitarExclusao(userId, rMot.valor);
  }

  /**
   * Registra log de acesso a dados pessoais (LGPD Art. 37).
   * @param {{ accessed_by: string, target_user_id: string, data_type: string, purpose: string }} dados
   * @returns {Promise<object>}
   */
  async registrarLogAcesso(dados) {
    const rBy  = InputValidator.uuid(dados?.accessed_by);
    const rTgt = InputValidator.uuid(dados?.target_user_id);
    if (!rBy.ok)  throw Object.assign(new Error(`accessed_by: ${rBy.msg}`),  { status: 400 });
    if (!rTgt.ok) throw Object.assign(new Error(`target_user_id: ${rTgt.msg}`), { status: 400 });

    if (!dados.data_type?.trim() || !dados.purpose?.trim())
      throw Object.assign(new Error('data_type e purpose são obrigatórios.'), { status: 400 });

    return this.#lgpdRepository.registrarLogAcesso(dados);
  }
}

module.exports = LgpdService;
