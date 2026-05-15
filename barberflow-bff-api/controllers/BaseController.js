'use strict';

const ApiResponse = require('../utils/ApiResponse');
const AppError    = require('../utils/AppError');

/**
 * BaseController — Classe base para controllers do BFF.
 *
 * Encapsula padrões de resposta via ApiResponse e protege
 * os handlers contra erros não tratados via handle().
 *
 * Uso:
 *   class AgendamentoController extends BaseController {
 *     #service;
 *
 *     constructor(service) {
 *       super();
 *       this.#service = service;
 *     }
 *
 *     async listar(req, res) {
 *       await this.handle(res, async () => {
 *         const dados = await this.#service.listar(req.user.id);
 *         this.success(res, dados);
 *       });
 *     }
 *   }
 *
 * Registro de rota no router:
 *   const ctrl = new AgendamentoController(service);
 *   router.get('/', ctrl.listar.bind(ctrl));
 */
class BaseController {

  /** @type {boolean} */
  #isProd;

  constructor() {
    this.#isProd = process.env.APP_ENV === 'production';
  }

  // ── Respostas ────────────────────────────────────────────────────

  /**
   * 200 OK.
   * @param {import('express').Response} res
   * @param {*}      [dados]
   * @param {object} [meta]
   */
  success(res, dados = null, meta = null) {
    ApiResponse.success(res, dados, meta);
  }

  /**
   * 201 Created.
   * @param {import('express').Response} res
   * @param {*} dados
   */
  created(res, dados) {
    ApiResponse.created(res, dados);
  }

  /**
   * 204 No Content.
   * @param {import('express').Response} res
   */
  noContent(res) {
    ApiResponse.noContent(res);
  }

  /**
   * 404 Not Found.
   * @param {import('express').Response} res
   * @param {string} [msg]
   */
  notFound(res, msg) {
    ApiResponse.notFound(res, msg);
  }

  /**
   * Falha com status do AppError (ou 500 para erros genéricos).
   * @param {import('express').Response} res
   * @param {AppError|Error} err
   */
  fail(res, err) {
    ApiResponse.fail(res, err, this.#isProd);
  }

  // ── Executor padrão ──────────────────────────────────────────────

  /**
   * Executa `fn` capturando erros e respondendo com fail() automaticamente.
   * Elimina try/catch repetitivo nos handlers.
   *
   * @param {import('express').Response} res
   * @param {() => Promise<void>} fn — handler assíncrono que usa this.success(), etc.
   */
  async handle(res, fn) {
    try {
      await fn();
    } catch (err) {
      // TODO: remover log após estabilização produção
      console.error('[BFF ERROR]', err);
      if (!res.headersSent) this.fail(res, err);
    }
  }

  // ── Factory de erro ──────────────────────────────────────────────

  /**
   * @param {string} msg
   * @param {number} [status=400]
   * @returns {AppError}
   */
  _erro(msg, status = 400) {
    return new AppError(msg, status);
  }
}

module.exports = BaseController;
