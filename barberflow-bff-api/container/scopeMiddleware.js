'use strict';

/**
 * scopeMiddleware — Cria um scope awilix por requisição HTTP.
 *
 * Garante que use cases scoped sejam instanciados e destruídos
 * por request, isolando estado entre requisições.
 *
 * @param {import('awilix').AwilixContainer} container
 * @returns {import('express').RequestHandler}
 */
function scopeMiddleware(container) {
  return (req, _res, next) => {
    req.container = container.createScope();
    next();
  };
}

module.exports = { scopeMiddleware };
