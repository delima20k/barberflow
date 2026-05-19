'use strict';

const ApiResponse = require('../utils/ApiResponse');
const AppError    = require('../utils/AppError');
const { logger }  = require('./logger');

/**
 * ErrorHandler — Middleware global de tratamento de erros (4 params).
 *
 * Deve ser registrado APÓS todas as rotas no app.js.
 *
 * Trata:
 *   - AppError operacional (4xx/5xx esperados) → responde com status + mensagem
 *   - Error genérico (inesperado) → loga como fatal, responde 500
 *
 * Em produção, erros 5xx têm mensagem genérica (sem vazar stack/detalhes).
 */
class ErrorHandler {

  /**
   * Middleware Express de erro global.
   * @type {import('express').ErrorRequestHandler}
   */
  // eslint-disable-next-line no-unused-vars
  static handle(err, req, res, _next) {
    const IS_PROD = process.env.APP_ENV === 'production';
    const status  = err.status ?? err.statusCode ?? 500;

    if (status >= 500) {
      logger.error({ err, method: req.method, path: req.path }, '[BFF] Erro interno');
    }

    // AppError operacional: mensagem pode ir ao cliente
    if (err instanceof AppError && err.isOperational) {
      return ApiResponse.fail(res, err, IS_PROD);
    }

    // Erro inesperado: status + mensagem genérica em produção
    const wrapped = Object.assign(err, { status });
    ApiResponse.fail(res, wrapped, IS_PROD);
  }
}

module.exports = ErrorHandler;
