'use strict';

// =============================================================
// BaseService.js — Classe base para todos os serviços backend.
// Camada: application (infra transversal)
//
// Elimina duplicação do padrão InputValidator em services:
//   const r = InputValidator.xxx(y);
//   if (!r.ok) throw Object.assign(new Error(r.msg), { status: 400 });
//
// Uso:
//   class MeuService extends BaseService {
//     constructor(repo) { super('MeuService'); ... }
//     async metodo(id) {
//       this._uuid('id', id);
//       const texto = this._texto('bio', dados.bio, 300);
//     }
//   }
// =============================================================

const InputValidator = require('./InputValidator');

class BaseService {

  #nome;

  /** @param {string} nome — nome da subclasse (para mensagens de erro) */
  constructor(nome) {
    this.#nome = nome;
  }

  // ── Validadores (lançam Error{status:400} em falha) ──────────

  /**
   * Valida UUID. Lança Error{status:400} se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  _uuid(campo, valor) {
    const r = InputValidator.uuid(valor);
    if (!r.ok) throw Object.assign(new Error(`${campo}: ${r.msg}`), { status: 400 });
  }

  /**
   * Valida e sanitiza texto livre. Lança Error{status:400} se inválido.
   * @param {string}  campo
   * @param {string}  valor
   * @param {number}  [maxLen=500]
   * @param {boolean} [obrig=false]
   * @returns {string} valor sanitizado
   */
  _texto(campo, valor, maxLen = 500, obrig = false) {
    const r = InputValidator.textoLivre(valor, maxLen, obrig);
    if (!r.ok) throw Object.assign(new Error(`${campo}: ${r.msg}`), { status: 400 });
    return r.valor;
  }

  /**
   * Valida enum. Lança Error{status:400} se valor não estiver na lista.
   * @param {string}   campo
   * @param {string}   valor
   * @param {string[]} opcoes
   */
  _enum(campo, valor, opcoes) {
    const r = InputValidator.enumValido(valor, opcoes);
    if (!r.ok) throw Object.assign(new Error(`${campo}: ${r.msg}`), { status: 400 });
  }

  /**
   * Valida e-mail. Lança Error{status:400} se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  _email(campo, valor) {
    const r = InputValidator.email(valor);
    if (!r.ok) throw Object.assign(new Error(`${campo}: ${r.msg}`), { status: 400 });
  }

  /**
   * Valida nome (full_name). Lança Error{status:400} se inválido.
   * @param {string} campo
   * @param {string} valor
   * @param {number} [minLen=2]
   */
  _nome(campo, valor, minLen = 2) {
    const r = InputValidator.nome(valor, minLen);
    if (!r.ok) throw Object.assign(new Error(`${campo}: ${r.msg}`), { status: 400 });
  }

  /**
   * Valida telefone. Lança Error{status:400} se inválido e obrigatório.
   * @param {string}  campo
   * @param {string}  valor
   * @param {boolean} [obrigatorio=false]
   */
  _telefone(campo, valor, obrigatorio = false) {
    const r = InputValidator.telefone(valor, obrigatorio);
    if (!r.ok) throw Object.assign(new Error(`${campo}: ${r.msg}`), { status: 400 });
  }

  /**
   * Valida par de coordenadas geográficas. Lança Error{status:400} se inválido.
   * @param {number} lat
   * @param {number} lng
   */
  _coordenada(lat, lng) {
    const r = InputValidator.coordenada(lat, lng);
    if (!r.ok) throw Object.assign(new Error(r.msg), { status: 400 });
  }

  // ── Factory de erro ──────────────────────────────────────────

  /**
   * Cria um Error com propriedade `status` para uso com `throw`.
   * @param {string} msg
   * @param {number} [status=400]
   * @returns {Error}
   */
  _erro(msg, status = 400) {
    return Object.assign(new Error(msg), { status });
  }
}

module.exports = BaseService;
