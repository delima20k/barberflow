'use strict';

const RequestDiagnostics = require('./RequestDiagnostics');
const { logger } = require('../middlewares/logger');

/**
 * RequestDiagnosticsMiddleware - habilita diagnostico leve por rota.
 */
class RequestDiagnosticsMiddleware {
  static #HEADER_NAME = 'x-barberflow-diagnostics';
  static #APPOINTMENT_VALUE = 'appointment';

  static initAppointment(req, res, next) {
    if (
      req.method !== 'POST' ||
      req.path !== '/api/agendamentos' ||
      !RequestDiagnosticsMiddleware.#isAppointmentDiagnosticsEnabled(req)
    ) {
      return next();
    }

    req.barberflowDiagnostics = new RequestDiagnostics('appointment_create');

    const applyHeaders = () => {
      const diagnostics = RequestDiagnostics.current(req);
      if (diagnostics && !res.headersSent) {
        diagnostics.finish();
        res.setHeader('X-Appointment-Diagnostics', diagnostics.toHeaderValue());
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
          route: 'POST /api/agendamentos',
          diagnostics: diagnostics.toObject(),
        }, '[BFF] appointment diagnostics');
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

  static #isAppointmentDiagnosticsEnabled(req) {
    const value = req.headers[RequestDiagnosticsMiddleware.#HEADER_NAME];
    if (Array.isArray(value)) {
      return value.some((item) => RequestDiagnosticsMiddleware.#matchesAppointmentValue(item));
    }
    return RequestDiagnosticsMiddleware.#matchesAppointmentValue(value);
  }

  static #matchesAppointmentValue(value) {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .includes(RequestDiagnosticsMiddleware.#APPOINTMENT_VALUE);
  }
}

module.exports = RequestDiagnosticsMiddleware;
