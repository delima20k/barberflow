'use strict';

// =============================================================
// FilaService.js — Regras de negócio de fila de espera.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao FilaRepository.
// =============================================================

const BaseService = require('../infra/BaseService');

class FilaService extends BaseService {

  static #STATUS_VALIDOS = ['waiting', 'in_service', 'done', 'cancelled'];

  #filaRepository;

  /** @param {import('../repositories/FilaRepository')} filaRepository */
  constructor(filaRepository) {
    super('FilaService');
    this.#filaRepository = filaRepository;
  }

  /**
   * Retorna entradas ativas da fila.
   * @param {string} barbeariaId
   * @returns {Promise<object[]>}
   */
  async verFila(barbeariaId) {
    this._uuid('barbeariaId', barbeariaId);
    return this.#filaRepository.getFila(barbeariaId);
  }

  /**
   * Entra na fila de uma barbearia.
   * @param {string} barbeariaId
   * @param {string} userId
   * @param {object} [dados] — { chair_id?, notes? }
   * @returns {Promise<object>}
   */
  async entrarFila(barbeariaId, userId, dados = {}) {
    this._uuid('barbeariaId', barbeariaId);
    this._uuid('userId', userId);

    if (dados.notes)    dados.notes    = this._texto('notes', dados.notes, 200);
    if (dados.chair_id) this._uuid('chair_id', dados.chair_id);

    return this.#filaRepository.entrar(barbeariaId, userId, dados);
  }

  /**
   * Sai da fila.
   * @param {string} entradaId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async sairFila(entradaId, userId) {
    this._uuid('entradaId', entradaId);
    this._uuid('userId', userId);
    return this.#filaRepository.sair(entradaId, userId);
  }

  /**
   * Atualiza status de uma entrada da fila.
   * @param {string} entradaId
   * @param {string} novoStatus
   * @returns {Promise<object>}
   */
  async atualizarStatusEntrada(entradaId, novoStatus) {
    this._uuid('entradaId', entradaId);
    this._enum('status', novoStatus, FilaService.#STATUS_VALIDOS);
    return this.#filaRepository.atualizarStatus(entradaId, novoStatus);
  }

  /**
   * Retorna o estado atual da fila com suporte a polling condicional.
   * Se `since` for fornecido e não houver mudanças desde esse timestamp,
   * retorna { semMudancas: true } para evitar re-renders desnecessários.
   *
   * @param {string}      barbeariaId
   * @param {string|null} since — ISO timestamp da última resposta recebida pelo cliente
   * @returns {Promise<{semMudancas:true}|{semMudancas:false, fila:object[], ultimaMudanca:string|null}>}
   */
  async estadoFila(barbeariaId, since = null) {
    this._uuid('barbeariaId', barbeariaId);

    const { fila, ultimaMudanca } = await this.#filaRepository.getEstado(barbeariaId);

    if (since && ultimaMudanca) {
      const sinceDate    = new Date(since);
      const mudancaDate  = new Date(ultimaMudanca);
      if (!isNaN(sinceDate) && mudancaDate <= sinceDate) {
        return { semMudancas: true };
      }
    }

    return { semMudancas: false, fila, ultimaMudanca };
  }
}

module.exports = FilaService;
