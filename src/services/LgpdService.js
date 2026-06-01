'use strict';

// =============================================================
// LgpdService.js — Regras de negócio de dados LGPD.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao LgpdRepository.
// =============================================================

const BaseService = require('../infra/BaseService');

class LgpdService extends BaseService {

  #lgpdRepository;

  /** @param {import('../repositories/LgpdRepository')} lgpdRepository */
  constructor(lgpdRepository) {
    super('LgpdService');
    this.#lgpdRepository = lgpdRepository;
  }

  /**
   * Verifica se o usuário tem consentimento registrado.
   * @param {string} userId
   * @returns {Promise<{ aceitou: boolean, dados: object|null }>}
   */
  async verificarConsentimento(userId) {
    this._uuid('userId', userId);
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
    this._uuid('userId', userId);

    if (!dados?.version?.trim())
      throw this._erro('version é obrigatório.');

    return this.#lgpdRepository.registrarAceite(userId, dados);
  }

  /**
   * Solicita exclusão de dados (LGPD Art. 18, VI).
   * @param {string} userId
   * @param {string} motivo
   * @returns {Promise<object>}
   */
  async solicitarExclusaoDados(userId, motivo) {
    this._uuid('userId', userId);
    const motivoSanitizado = this._texto('motivo', motivo ?? '', 1000, true);
    return this.#lgpdRepository.solicitarExclusao(userId, motivoSanitizado);
  }

  /**
   * Registra log de acesso a dados pessoais (LGPD Art. 37).
   * @param {{ accessed_by: string, target_user_id: string, data_type: string, purpose: string }} dados
   * @returns {Promise<object>}
   */
  async registrarLogAcesso(dados) {
    this._uuid('accessed_by', dados?.accessed_by);
    this._uuid('target_user_id', dados?.target_user_id);

    if (!dados.data_type?.trim() || !dados.purpose?.trim())
      throw this._erro('data_type e purpose são obrigatórios.');

    return this.#lgpdRepository.registrarLogAcesso(dados);
  }
}

module.exports = LgpdService;
