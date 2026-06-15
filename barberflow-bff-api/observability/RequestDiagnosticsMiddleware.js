'use strict';

const RequestDiagnostics = require('./RequestDiagnostics');
const { logger } = require('../middlewares/logger');

/**
 * RequestDiagnosticsMiddleware - habilita diagnostico leve por rota.
 */
class RequestDiagnosticsMiddleware {
  static #HEADER_NAME = 'x-barberflow-diagnostics';
  static #CONFIG = Object.freeze({
    appointment: {
      value: 'appointment',
      name: 'appointment_create',
      route: 'POST /api/agendamentos',
      path: '/api/agendamentos',
      header: 'X-Appointment-Diagnostics',
    },
    chat: {
      value: 'chat',
      name: 'chat_send',
      route: 'POST /api/v1/chat/conversations/:conversationId/messages',
      pathPattern: /^\/api\/v1\/chat\/conversations\/[^/]+\/messages$/,
      header: 'X-Chat-Diagnostics',
    },
  });

  static initAppointment(req, res, next) {
    return RequestDiagnosticsMiddleware.#init(req, res, next, RequestDiagnosticsMiddleware.#CONFIG.appointment);
  }

  static initChat(req, res, next) {
    return RequestDiagnosticsMiddleware.#init(req, res, next, RequestDiagnosticsMiddleware.#CONFIG.chat);
  }

  static #init(req, res, next, config) {
    if (!RequestDiagnosticsMiddleware.#matchesRoute(req, config)
      || !RequestDiagnosticsMiddleware.#isDiagnosticsEnabled(req, config.value)) {
      return next();
    }

    req.barberflowDiagnostics = new RequestDiagnostics(config.name);

    const applyHeaders = () => {
      const diagnostics = RequestDiagnostics.current(req);
      if (diagnostics && !res.headersSent) {
        diagnostics.finish();
        res.setHeader(config.header, diagnostics.toHeaderValue());
        res.setHeader('Server-Timing', diagnostics.toServerTiming());
      }
    };

    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function (...args) {
      applyHeaders();
      return originalWriteHead(...args);
    };

    const originalEnd = res.end.bind(res);
    res.end = function (...args) {
      applyHeaders();
      const diagnostics = RequestDiagnostics.current(req);
      if (diagnostics) {
        logger.info({
          route: config.route,
          diagnostics: diagnostics.toObject(),
        }, `[BFF] ${config.value} diagnostics`);
      }
      return originalEnd(...args);
    };

    return next();
  }

  static measure(step, middleware) {
    return (req, res, next) => {
      const diagnostics = RequestDiagnostics.current(req);
      if (!diagnostics) return middleware(req, res, next);

      const startedAt = process.hrtime.bigint();
      const done = (err) => {
        diagnostics.record(step, Number(process.hrtime.bigint() - startedAt) / 1e6);
        next(err);
      };

      return middleware(req, res, done);
    };
  }

  static #matchesRoute(req, config) {
    if (req.method !== 'POST') return false;
    if (config.path) return req.path === config.path;
    return config.pathPattern?.test(req.path) === true;
  }

  static #isDiagnosticsEnabled(req, expectedValue) {
    const value = req.headers[RequestDiagnosticsMiddleware.#HEADER_NAME];
    if (Array.isArray(value)) {
      return value.some((item) => RequestDiagnosticsMiddleware.#matchesValue(item, expectedValue));
    }
    return RequestDiagnosticsMiddleware.#matchesValue(value, expectedValue);
  }

  static #matchesValue(value, expectedValue) {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .includes(expectedValue);
  }
}

module.exports = RequestDiagnosticsMiddleware;
