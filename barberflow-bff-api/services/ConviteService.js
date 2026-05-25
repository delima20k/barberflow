'use strict';

const BaseService = require('./BaseService');

class ConviteService extends BaseService {

  /** @type {import('../repositories/ConviteRepository')} */
  #repo;

  /** @param {import('../repositories/ConviteRepository')} repo */
  constructor(repo) {
    super('ConviteService');
    this.#repo = repo;
  }

  /**
   * @param {string} profissionalId
   * @returns {Promise<object[]>}
   */
  async listarConvites(profissionalId) {
    this._uuid('profissionalId', profissionalId);
    return this.#repo.getConvites(profissionalId);
  }

  /**
   * @param {string} profissionalId
   * @param {string} inviteId
   * @returns {Promise<{aceito: true}>}
   */
  async aceitarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);
    return this.#repo.aceitarConvite(profissionalId, inviteId);
  }

  /**
   * @param {string} profissionalId
   * @param {string} inviteId
   * @returns {Promise<{recusado: true}>}
   */
  async recusarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);
    return this.#repo.recusarConvite(profissionalId, inviteId);
  }
}

module.exports = ConviteService;
