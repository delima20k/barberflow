'use strict';

const ApiResponse  = require('../utils/ApiResponse');
const AppError     = require('../utils/AppError');
const { logger }   = require('./logger');

// Lazy-requires para não criar dependência circular nem falhar se não configurado
function _sentry() {
  try { return require('../observability/SentryClient').SentryClient; } catch { return null; }
}
function _ctx() {
  try { return require('../observability/CorrelationContext').CorrelationContext; } catch { return null; }
}

/**
 * ErrorHandler — Middleware global de tratamento de erros (4 params).
 *
 * Deve ser registrado APÓS todas as rotas no app.js.
 *
 * Trata:
 *   - AppError operacional (4xx/5xx esperados) → responde com status + mensagem
 *   - Error genérico (inesperado) → loga como fatal, envia ao Sentry, responde 500
 *
 * Toda exception não tratada vira:
 *   1. Log estruturado com correlationId/traceId (campos obrigatórios)
 *   2. Alerta Sentry com contexto de domínio (sem PII)
 *   3. Resposta HTTP 500 com mensagem genérica em produção
 */
class ErrorHandler {

  /**
   * Middleware Express de erro global.
   * @type {import('express').ErrorRequestHandler}
   */
  // eslint-disable-next-line no-unused-vars
  static handle(err, req, res, _next) {
    try {
      const IS_PROD = process.env.APP_ENV === 'production';
      const status  = err?.status ?? err?.statusCode ?? 500;

      const ctx = _ctx();
      const correlationId = ctx?.correlationId ?? null;
      const traceId       = ctx?.traceId       ?? null;
      const userId        = ctx?.userId        ?? null;

      if (status >= 500) {
        logger.error(
          { err, method: req.method, path: req.path, correlationId, traceId, userId },
          '[BFF] Erro interno não tratado',
        );

        // Envia ao Sentry com contexto de domínio (sem PII)
        _sentry()?.captureError(err, {
          userId,
          route:   `${req.method} ${req.path}`,
          traceId,
          correlationId,
          domain:  'bff',
          command: req.body?.command ?? null,
        });
      } else if (status >= 400) {
        logger.warn(
          { status, method: req.method, path: req.path, correlationId, traceId },
          '[BFF] Erro de cliente',
        );
      }

      // Todos os AppError (operacionais ou não) → ApiResponse.fail decide visibilidade da mensagem
      // NUNCA usar Object.assign sobre AppError: getters readonly lançam TypeError em strict mode
      if (err instanceof AppError) {
        return ApiResponse.fail(res, err, IS_PROD);
      }

      // Erro genérico não-AppError: cria novo Error simples para evitar mutação
      const fallback = Object.assign(new Error(err?.message ?? 'Erro interno.'), { status });
      ApiResponse.fail(res, fallback, IS_PROD);
    } catch {
      // Garantia final: nunca retornar HTML mesmo que o próprio handler falhe
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Erro interno do servidor.' });
      }
    }
  }
}

module.exports = ErrorHandler;
