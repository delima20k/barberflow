'use strict';

const InputValidator = require('../../shared/js/InputValidator');
const AppError       = require('../utils/AppError');

/**
 * BaseValidator — Wrapper OOP sobre InputValidator para uso no BFF.
 *
 * Converte o resultado { ok, msg } do InputValidator em AppError(400),
 * eliminando boilerplate repetitivo em services e repositories.
 *
 * Uso via herança (através de BaseService/BaseRepository):
 *   this._uuid('id', valor);
 *
 * Uso direto (estático):
 *   BaseValidator.uuid('userId', valor);
 */
class BaseValidator {

  /**
   * Valida UUID. Lança AppError(400) se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  static uuid(campo, valor) {
    const r = InputValidator.uuid(valor);
    if (!r.ok) throw AppError.badRequest(`${campo}: ${r.msg}`);
  }

  /**
   * Valida e-mail. Lança AppError(400) se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  static email(campo, valor) {
    const r = InputValidator.email(valor);
    if (!r.ok) throw AppError.badRequest(`${campo}: ${r.msg}`);
  }

  /**
   * Valida e sanitiza texto livre. Lança AppError(400) se inválido.
   * @param {string}  campo
   * @param {string}  valor
   * @param {number}  [maxLen=500]
   * @param {boolean} [obrigatorio=false]
   * @returns {string} valor sanitizado
   */
  static texto(campo, valor, maxLen = 500, obrigatorio = false) {
    const r = InputValidator.textoLivre(valor, maxLen, obrigatorio);
    if (!r.ok) throw AppError.badRequest(`${campo}: ${r.msg}`);
    return r.valor;
  }

  /**
   * Valida enum. Lança AppError(400) se valor não estiver na lista.
   * @param {string}   campo
   * @param {string}   valor
   * @param {string[]} opcoes
   */
  static enum(campo, valor, opcoes) {
    const r = InputValidator.enumValido(valor, opcoes);
    if (!r.ok) throw AppError.badRequest(`${campo}: ${r.msg}`);
  }

  /**
   * Valida nome (full_name). Lança AppError(400) se inválido.
   * @param {string} campo
   * @param {string} valor
   * @param {number} [minLen=2]
   */
  static nome(campo, valor, minLen = 2) {
    const r = InputValidator.nome(valor, minLen);
    if (!r.ok) throw AppError.badRequest(`${campo}: ${r.msg}`);
  }

  /**
   * Filtra payload contra allowlist (previne mass assignment).
   * Lança AppError(400) se nenhum campo permitido for informado.
   * @param {object}   dados
   * @param {string[]} camposPermitidos
   * @returns {object} payload sanitizado
   */
  static payload(dados, camposPermitidos) {
    const r = InputValidator.payload(dados, camposPermitidos);
    if (!r.ok) throw AppError.badRequest(r.msg);
    return r.valor;
  }

  /**
   * Valida par de coordenadas geográficas. Lança AppError(400) se inválido.
   * @param {number} lat
   * @param {number} lng
   */
  static coordenada(lat, lng) {
    const r = InputValidator.coordenada(lat, lng);
    if (!r.ok) throw AppError.badRequest(r.msg);
  }
}

module.exports = BaseValidator;
