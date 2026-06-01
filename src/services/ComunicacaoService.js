'use strict';

// =============================================================
// ComunicacaoService.js — Regras de negócio de comunicação.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ComunicacaoRepository.
//
// Mensagens diretas foram migradas para P2P com E2E encryption.
// Ver: shared/js/P2PMessageConnectionService.js
// =============================================================

const BaseService = require('../infra/BaseService');

class ComunicacaoService extends BaseService {

  #comunicacaoRepository;

  /** @param {import('../repositories/ComunicacaoRepository')} comunicacaoRepository */
  constructor(comunicacaoRepository) {
    super('ComunicacaoService');
    this.#comunicacaoRepository = comunicacaoRepository;
  }

  /**
   * Lista notificações do usuário.
   * @param {string} userId
   * @param {number} [limit=30]
   * @returns {Promise<object[]>}
   */
  async listarNotificacoes(userId, limit = 30) {
    this._uuid('userId', userId);
    return this.#comunicacaoRepository.getNotificacoes(userId, limit);
  }

  /**
   * Marca notificação como lida.
   * @param {string} notificationId
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async marcarNotificacaoLida(notificationId, userId) {
    this._uuid('notificationId', notificationId);
    this._uuid('userId', userId);
    return this.#comunicacaoRepository.marcarLida(notificationId, userId);
  }

}

module.exports = ComunicacaoService;
