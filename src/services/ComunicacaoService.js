'use strict';

// =============================================================
// ComunicacaoService.js — Regras de negócio de comunicação.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ComunicacaoRepository.
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

  /**
   * Lista conversa com um contato.
   * @param {string} userId
   * @param {string} contatoId
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async listarConversa(userId, contatoId, limit = 50) {
    this._uuid('userId', userId);
    this._uuid('contatoId', contatoId);
    return this.#comunicacaoRepository.getConversa(userId, contatoId, limit);
  }

  /**
   * Envia mensagem direta.
   * Regra de negócio: não é possível enviar mensagem para si mesmo.
   * @param {string} userId
   * @param {string} destinatarioId
   * @param {string} conteudo
   * @returns {Promise<object>}
   */
  async enviarMensagem(userId, destinatarioId, conteudo) {
    this._uuid('userId', userId);
    this._uuid('destinatarioId', destinatarioId);

    if (userId === destinatarioId)
      throw this._erro('Não é possível enviar mensagem para si mesmo.');

    const texto = this._texto('conteudo', conteudo?.trim() ?? '', 2000, true);
    return this.#comunicacaoRepository.enviarMensagem(userId, destinatarioId, texto);
  }
}

module.exports = ComunicacaoService;
