'use strict';

const BaseValidator = require('../validators/BaseValidator');
const AppError      = require('../utils/AppError');

/**
 * BaseService — Classe base para serviços do BFF.
 *
 * Fornece validadores e factory de erros que eliminam
 * boilerplate repetitivo em cada service.
 *
 * Uso:
 *   class AgendamentoService extends BaseService {
 *     #repo;
 *
 *     constructor(repo) {
 *       super('AgendamentoService');
 *       this.#repo = repo;
 *     }
 *
 *     async buscar(profissionalId, agendamentoId) {
 *       this._uuid('profissionalId', profissionalId);
 *       this._uuid('agendamentoId', agendamentoId);
 *       return this.#repo.getById(agendamentoId, profissionalId);
 *     }
 *   }
 */
class BaseService {

  /** @type {string} */
  #nome;

  /** @param {string} nome — nome da subclasse (para mensagens de erro) */
  constructor(nome) {
    this.#nome = nome;
  }

  // ── Validadores ──────────────────────────────────────────────────

  /**
   * Valida UUID. Lança AppError(400) se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  _uuid(campo, valor) {
    BaseValidator.uuid(campo, valor);
  }

  /**
   * Valida e-mail. Lança AppError(400) se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  _email(campo, valor) {
    BaseValidator.email(campo, valor);
  }

  /**
   * Valida e sanitiza texto livre.
   * @param {string}  campo
   * @param {string}  valor
   * @param {number}  [maxLen=500]
   * @param {boolean} [obrig=false]
   * @returns {string} valor sanitizado
   */
  _texto(campo, valor, maxLen = 500, obrig = false) {
    return BaseValidator.texto(campo, valor, maxLen, obrig);
  }

  /**
   * Valida enum. Lança AppError(400) se valor não estiver na lista.
   * @param {string}   campo
   * @param {string}   valor
   * @param {string[]} opcoes
   */
  _enum(campo, valor, opcoes) {
    BaseValidator.enum(campo, valor, opcoes);
  }

  /**
   * Valida nome (full_name).
   * @param {string} campo
   * @param {string} valor
   * @param {number} [minLen=2]
   */
  _nome(campo, valor, minLen = 2) {
    BaseValidator.nome(campo, valor, minLen);
  }

  /**
   * Valida coordenadas geográficas.
   * @param {number} lat
   * @param {number} lng
   */
  _coordenada(lat, lng) {
    BaseValidator.coordenada(lat, lng);
  }

  // ── Factory de erros ─────────────────────────────────────────────

  /**
   * Cria AppError com status customizável.
   * @param {string} msg
   * @param {number} [status=400]
   * @returns {AppError}
   */
  _erro(msg, status = 400) {
    return new AppError(msg, status);
  }

  /** @returns {string} */
  get _nomeSvc() { return this.#nome; }
}

module.exports = BaseService;
