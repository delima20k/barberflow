'use strict';

const InputValidator = require('./InputValidator');

/**
 * ValidationMiddleware — validação declarativa de inputs por schema.
 *
 * Cada campo do schema define: tipo, obrigatorio, e opções do tipo.
 * Tipos suportados: 'uuid', 'email', 'nome', 'telefone', 'texto',
 *                   'enum', 'numero', 'booleano'.
 *
 * Ao ser bloqueado, responde 400 com:
 *   { ok: false, error: string (primeiro erro), erros: string[] (todos) }
 *
 * Para tipo 'texto', o valor sanitizado (trim + sem null bytes) é
 * escrito de volta no req[fonte] antes de chamar next().
 *
 * Uso:
 *   router.post('/rota',
 *     ValidationMiddleware.corpo({
 *       email: { tipo: 'email', obrigatorio: true },
 *       bio:   { tipo: 'texto', maxLen: 300 },
 *     }),
 *     handler
 *   );
 */
class ValidationMiddleware {

  /**
   * Valida req.body conforme o schema.
   * @param {Record<string, Regra>} schema
   * @returns {import('express').RequestHandler}
   */
  static corpo(schema) {
    return ValidationMiddleware.#criar('body', schema);
  }

  /**
   * Valida req.params conforme o schema.
   * @param {Record<string, Regra>} schema
   * @returns {import('express').RequestHandler}
   */
  static params(schema) {
    return ValidationMiddleware.#criar('params', schema);
  }

  /**
   * Valida req.query conforme o schema.
   * @param {Record<string, Regra>} schema
   * @returns {import('express').RequestHandler}
   */
  static query(schema) {
    return ValidationMiddleware.#criar('query', schema);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Fábrica interna: retorna um middleware que valida req[fonte].
   *
   * @param {'body'|'params'|'query'} fonte
   * @param {Record<string, Regra>}   schema
   */
  static #criar(fonte, schema) {
    return (req, res, next) => {
      const erros = [];
      const dados = req[fonte] ?? {};

      for (const [campo, regra] of Object.entries(schema)) {
        const r = ValidationMiddleware.#validarCampo(campo, dados[campo], regra);

        if (!r.ok) {
          erros.push(r.msg);
          continue;
        }

        // Escreve o valor sanitizado de volta (apenas tipo 'texto')
        if (r.valorSanitizado !== undefined) {
          req[fonte][campo] = r.valorSanitizado;
        }
      }

      if (erros.length > 0) {
        return res.status(400).json({ ok: false, error: erros[0], erros });
      }

      return next();
    };
  }

  /**
   * Valida um único campo conforme a regra.
   *
   * @param {string} campo  — nome do campo (para mensagens de erro)
   * @param {*}      valor  — valor em req[fonte][campo]
   * @param {Regra}  regra  — definição da regra de validação
   * @returns {{ ok: boolean, msg?: string, valorSanitizado?: string }}
   */
  static #validarCampo(campo, valor, regra) {
    const ausente = valor === undefined || valor === null || valor === '';

    if (ausente) {
      if (regra.obrigatorio) return { ok: false, msg: `"${campo}" é obrigatório.` };
      return { ok: true };
    }

    switch (regra.tipo) {
      case 'uuid': {
        const r = InputValidator.uuid(valor);
        return { ok: r.ok, msg: r.ok ? '' : `"${campo}": ${r.msg}` };
      }

      case 'email': {
        const r = InputValidator.email(valor);
        return { ok: r.ok, msg: r.ok ? '' : `"${campo}": ${r.msg}` };
      }

      case 'nome': {
        const r = InputValidator.nome(valor);
        return { ok: r.ok, msg: r.ok ? '' : `"${campo}": ${r.msg}` };
      }

      case 'telefone': {
        const r = InputValidator.telefone(valor, regra.obrigatorio ?? false);
        return { ok: r.ok, msg: r.ok ? '' : `"${campo}": ${r.msg}` };
      }

      case 'texto': {
        const r = InputValidator.textoLivre(
          valor,
          regra.maxLen    ?? 500,
          regra.obrigatorio ?? false,
        );
        return {
          ok:             r.ok,
          msg:            r.ok ? '' : `"${campo}": ${r.msg}`,
          valorSanitizado: r.ok ? r.valor : undefined,
        };
      }

      case 'enum': {
        const r = InputValidator.enumValido(valor, regra.opcoes ?? []);
        return { ok: r.ok, msg: r.ok ? '' : `"${campo}": ${r.msg}` };
      }

      case 'numero': {
        const n = Number(valor);
        if (!isFinite(n))
          return { ok: false, msg: `"${campo}": deve ser um número.` };
        if (regra.min !== undefined && n < regra.min)
          return { ok: false, msg: `"${campo}": mínimo ${regra.min}.` };
        if (regra.max !== undefined && n > regra.max)
          return { ok: false, msg: `"${campo}": máximo ${regra.max}.` };
        return { ok: true };
      }

      case 'booleano': {
        const validos = new Set([true, false, 'true', 'false', 1, 0]);
        if (!validos.has(valor))
          return { ok: false, msg: `"${campo}": deve ser verdadeiro ou falso.` };
        return { ok: true };
      }

      default:
        return { ok: false, msg: `"${campo}": tipo de validação "${regra.tipo}" desconhecido.` };
    }
  }
}

module.exports = ValidationMiddleware;

/**
 * @typedef {object} Regra
 * @property {'uuid'|'email'|'nome'|'telefone'|'texto'|'enum'|'numero'|'booleano'} tipo
 * @property {boolean}  [obrigatorio]  — default false
 * @property {number}   [maxLen]       — apenas para tipo 'texto' (default 500)
 * @property {string[]} [opcoes]       — apenas para tipo 'enum'
 * @property {number}   [min]          — apenas para tipo 'numero'
 * @property {number}   [max]          — apenas para tipo 'numero'
 */
