'use strict';

/**
 * AppError — Erro HTTP estruturado com código de status.
 *
 * Uso:
 *   throw new AppError('Recurso não encontrado.', 404);
 *   throw new AppError('Credenciais inválidas.', 401);
 *
 * O errorHandler global captura AppError e responde com o status correto.
 * Erros não-AppError são tratados como 500 (erro interno).
 */
class AppError extends Error {
  /** @type {number} HTTP status code */
  #status;

  /** @type {boolean} Sinaliza ao errorHandler que é um erro esperado (não loga como fatal) */
  #isOperational;

  /**
   * @param {string}  message
   * @param {number}  [status=500]
   * @param {boolean} [isOperational=true]
   */
  constructor(message, status = 500, isOperational = true) {
    super(message);
    this.name           = 'AppError';
    this.#status        = status;
    this.#isOperational = isOperational;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /** @returns {number} */
  get status() { return this.#status; }

  /** @returns {boolean} */
  get isOperational() { return this.#isOperational; }

  // ── Factory methods ──────────────────────────────────────────────

  static badRequest(msg = 'Requisição inválida.')    { return new AppError(msg, 400); }
  static unauthorized(msg = 'Não autenticado.')      { return new AppError(msg, 401); }
  static forbidden(msg = 'Acesso negado.')           { return new AppError(msg, 403); }
  static notFound(msg = 'Recurso não encontrado.')   { return new AppError(msg, 404); }
  static conflict(msg = 'Conflito de dados.')        { return new AppError(msg, 409); }
  static unprocessable(msg = 'Dados inválidos.')     { return new AppError(msg, 422); }
  static tooMany(msg = 'Muitas requisições.')        { return new AppError(msg, 429); }
  static internal(msg = 'Erro interno do servidor.') { return new AppError(msg, 500, false); }
  static unavailable(msg = 'Serviço indisponível.')  { return new AppError(msg, 503); }
}

module.exports = AppError;
