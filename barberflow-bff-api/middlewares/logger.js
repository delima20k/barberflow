'use strict';

const pino     = require('pino');
const pinoHttp = require('pino-http');

const IS_PROD = process.env.APP_ENV === 'production';

// ── Transporte dev: pino-pretty se disponível ────────────────────
const devTransport = (() => {
  if (IS_PROD) return undefined;
  try {
    require.resolve('pino-pretty');
    return {
      target:  'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    };
  } catch {
    return undefined;
  }
})();

// ── Logger base ───────────────────────────────────────────────────
const logger = pino({
  name:      'bff-barberflow',
  level:     process.env.LOG_LEVEL ?? (IS_PROD ? 'info' : 'debug'),
  transport: devTransport,
  base:      { pid: process.pid, env: process.env.APP_ENV ?? 'development' },
  redact: {
    paths:  [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.senha',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ── Middleware HTTP ───────────────────────────────────────────────
const loggerMiddleware = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/api/health' || req.url === '/api/v1/health',
  },
  customLogLevel: (_req, res) =>
    res.statusCode >= 500 ? 'error'
    : res.statusCode >= 400 ? 'warn'
    : 'info',
});

module.exports = { logger, loggerMiddleware };
