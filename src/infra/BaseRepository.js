'use strict';

// =============================================================
// BaseRepository.js — Classe base para repositórios backend.
// Camada: infra
//
// Fornece helpers de validação de entrada reutilizáveis em todos
// os repositórios, eliminando duplicação do padrão:
//   const r = InputValidator.uuid(x);
//   if (!r.ok) throw new TypeError(`[Repo] campo: ${r.msg}`);
// =============================================================

const InputValidator = require('./InputValidator');

class BaseRepository {

  #nome;

  /**
   * @param {string} nome — nome da classe concreta (usado nas mensagens de erro).
   */
  constructor(nome) {
    this.#nome = nome;
  }

  /**
   * Valida um UUID. Lança TypeError descritivo se inválido.
   * @param {string} campo — nome do campo (ex: 'userId', 'barbershopId')
   * @param {string} valor — valor a validar
   */
  _validarUuid(campo, valor) {
    const r = InputValidator.uuid(valor);
    if (!r.ok) throw new TypeError(`[${this.#nome}] ${campo}: ${r.msg}`);
  }

  /**
   * Valida um e-mail. Lança TypeError descritivo se inválido.
   * @param {string} valor — e-mail a validar
   */
  _validarEmail(valor) {
    const r = InputValidator.email(valor);
    if (!r.ok) throw new TypeError(`[${this.#nome}] email: ${r.msg}`);
  }

  /**
   * Filtra payload contra allowlist (previne mass assignment).
   * Lança TypeError se nenhum campo permitido for informado.
   * @param {object}   dados            — objeto de entrada
   * @param {string[]} camposPermitidos — lista de campos aceitos
   * @returns {object} payload sanitizado
   */
  _validarPayload(dados, camposPermitidos) {
    const { ok, msg, valor } = InputValidator.payload(dados, camposPermitidos);
    if (!ok) throw new TypeError(`[${this.#nome}] ${msg}`);
    return valor;
  }

  /**
   * Valida texto livre (comprimento, null-bytes, obrigatoriedade).
   * Lança TypeError descritivo se inválido.
   * @param {string}  campo        — nome do campo (usado na mensagem de erro)
   * @param {string}  valor        — texto a validar
   * @param {number}  [maxLen=500] — comprimento máximo
   * @param {boolean} [obrigatorio=false]
   * @returns {string} valor sanitizado (trimmed, sem null-bytes)
   */
  _validarTexto(campo, valor, maxLen = 500, obrigatorio = false) {
    const r = InputValidator.textoLivre(valor, maxLen, obrigatorio);
    if (!r.ok) throw new TypeError(`[${this.#nome}] ${campo}: ${r.msg}`);
    return r.valor;
  }

  /**
   * Valida par de coordenadas geográficas. Lança TypeError se inválido.
   * @param {number} lat
   * @param {number} lng
   */
  _validarCoordenada(lat, lng) {
    const r = InputValidator.coordenada(lat, lng);
    if (!r.ok) throw new TypeError(`[${this.#nome}] ${r.msg}`);
  }
}

module.exports = BaseRepository;
