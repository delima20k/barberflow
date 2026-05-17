'use strict';

const crypto         = require('node:crypto');
const ApiResponse    = require('../utils/ApiResponse');
const AppError       = require('../utils/AppError');
const { logger }     = require('../middlewares/logger');

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
      logger.error({ err }, '[BFF] erro no handler');
      if (!res.headersSent) this.fail(res, err);
    }
  }

  // ── Cache ────────────────────────────────────────────────────────

  /**
   * Define Cache-Control para respostas públicas — deve ser chamado
   * antes de success() / created() para garantir que o header seja enviado.
   * @param {import('express').Response} res
   * @param {number} [maxAge=60]  — segundos de cache fresco
   * @param {number} [swr=300]    — segundos de stale-while-revalidate
   */
  cachePublico(res, maxAge = 60, swr = 300) {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);
  }

  /**
   * Gera ETag SHA-1 baseado no conteúdo e seta o header.
   * Retorna true se o cliente já tem a versão atual (If-None-Match bate) —
   * nesse caso o handler deve responder 304 e encerrar.
   *
   * Uso:
   *   const dados = await svc.listar();
   *   if (this.etag(req, res, dados)) return;
   *   this.cachePublico(res, 60, 300);
   *   this.success(res, dados);
   *
   * @param {import('express').Request}  req
   * @param {import('express').Response} res
   * @param {*} dados
   * @returns {boolean} — true se 304 foi enviado
   */
  etag(req, res, dados) {
    const tag = `"${crypto.createHash('sha1').update(JSON.stringify(dados)).digest('hex').slice(0, 16)}"`;
    res.setHeader('ETag', tag);
    if (req.headers['if-none-match'] === tag) {
      res.status(304).end();
      return true;
    }
    return false;
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
