'use strict';

// =============================================================
// ComunicacaoService.js — Regras de negócio de comunicação.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ComunicacaoRepository.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class ComunicacaoService {

  #comunicacaoRepository;

  /** @param {import('../repositories/ComunicacaoRepository')} comunicacaoRepository */
  constructor(comunicacaoRepository) {
    this.#comunicacaoRepository = comunicacaoRepository;
  }

  /**
   * Lista notificações do usuário.
   * @param {string} userId
   * @param {number} [limit=30]
   * @returns {Promise<object[]>}
   */
  async listarNotificacoes(userId, limit = 30) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#comunicacaoRepository.getNotificacoes(userId, limit);
  }

  /**
   * Marca notificação como lida.
   * @param {string} notificationId
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async marcarNotificacaoLida(notificationId, userId) {
    const rNot = InputValidator.uuid(notificationId);
    if (!rNot.ok) throw Object.assign(new Error(rNot.msg), { status: 400 });

    const rUsr = InputValidator.uuid(userId);
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });

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
    const rUsr = InputValidator.uuid(userId);
    const rCon = InputValidator.uuid(contatoId);
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });
    if (!rCon.ok) throw Object.assign(new Error(rCon.msg), { status: 400 });

    return this.#comunicacaoRepository.getConversa(userId, contatoId, limit);
  }

  /**
   * Envia mensagem direta.
   * @param {string} userId
   * @param {string} destinatarioId
   * @param {string} conteudo
   * @returns {Promise<object>}
   */
  async enviarMensagem(userId, destinatarioId, conteudo) {
    const rUsr = InputValidator.uuid(userId);
    const rDst = InputValidator.uuid(destinatarioId);
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });
    if (!rDst.ok) throw Object.assign(new Error(rDst.msg), { status: 400 });

    const rTxt = InputValidator.textoLivre(conteudo?.trim() ?? '', 2000, true);
    if (!rTxt.ok) throw Object.assign(new Error(`conteudo: ${rTxt.msg}`), { status: 400 });

    return this.#comunicacaoRepository.enviarMensagem(userId, destinatarioId, rTxt.valor);
  }
}

module.exports = ComunicacaoService;
