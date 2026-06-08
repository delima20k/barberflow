'use strict';

/**
 * ApiResponse — Formatos padronizados de resposta HTTP.
 *
 * Mantém consistência com o padrão { ok, dados, error } já usado em src/.
 *
 * Uso no controller:
 *   ApiResponse.success(res, dados);
 *   ApiResponse.created(res, dados);
 *   ApiResponse.fail(res, new AppError('msg', 400));
 *   ApiResponse.notFound(res);
 */
class ApiResponse {

  /**
   * 200 OK com dados.
   * @param {import('express').Response} res
   * @param {*}      [dados]
   * @param {object} [meta] — paginação, totais, etc.
   */
  static success(res, dados = null, meta = null) {
    const payload = { ok: true };
    if (dados !== null) payload.dados = dados;
    if (meta  !== null) payload.meta  = meta;
    res.status(200).json(payload);
  }

  /**
   * 201 Created.
   * @param {import('express').Response} res
   * @param {*} dados
   */
  static created(res, dados) {
    res.status(201).json({ ok: true, dados });
  }

  /**
   * 204 No Content — para DELETE sem body.
   * @param {import('express').Response} res
   */
  static noContent(res) {
    res.status(204).end();
  }

  /**
   * Erro com status extraído do AppError ou genérico 500.
   * Em produção, erros 5xx retornam mensagem genérica.
   * @param {import('express').Response} res
   * @param {import('./AppError')|Error}  err
   * @param {boolean} [isProd=false]
   */
  static fail(res, err, isProd = false) {
    const status      = err.status ?? 500;
    const operational = err.isOperational ?? false;
    const isPublic    = status < 500 || !isProd || operational;
    const message     = isPublic
      ? (err.message ?? 'Erro interno.')
      : 'Erro interno do servidor.';
    res.status(status).json({ ok: false, error: message });
  }

  /**
   * 404 Not Found.
   * @param {import('express').Response} res
   * @param {string} [msg]
   */
  static notFound(res, msg = 'Recurso não encontrado.') {
    res.status(404).json({ ok: false, error: msg });
  }

  /**
   * 400 Bad Request.
   * @param {import('express').Response} res
   * @param {string} msg
   */
  static badRequest(res, msg) {
    res.status(400).json({ ok: false, error: msg });
  }

  /**
   * 401 Unauthorized.
   * @param {import('express').Response} res
   * @param {string} [msg]
   */
  static unauthorized(res, msg = 'Não autenticado.') {
    res.status(401).json({ ok: false, error: msg });
  }
}

module.exports = ApiResponse;
