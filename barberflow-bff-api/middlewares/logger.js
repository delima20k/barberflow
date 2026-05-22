'use strict';

const pino     = require('pino');
const pinoHttp = require('pino-http');

// CorrelationContext enriquece TODOS os logs com correlationId/traceId/userId.
// Lazy-require para evitar dependência circular se logger.js for carregado antes
// do módulo de observabilidade ser inicializado.
function _getCtx() {
  try { return require('../observability/CorrelationContext').CorrelationContext; }
  catch { return null; }
}

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

// ── Logger base (JSON estruturado) ────────────────────────────────
// Campos obrigatórios em TODOS os logs:
//   - correlationId  → rastreabilidade cross-service
//   - traceId        → correlação com OTel traces
//   - userId         → (quando disponível) identificação sem PII
//   - requestId      → identificação única do request HTTP
//   - service        → "bff-barberflow" (emitido via `name`)
//   - level          → nível semântico (ver docs/observabilidade.md)
//   - time           → ISO 8601
const logger = pino({
  name:      'bff-barberflow',
  level:     process.env.LOG_LEVEL ?? (IS_PROD ? 'info' : 'debug'),
  transport: devTransport,
  base:      { pid: process.pid, env: process.env.APP_ENV ?? 'development' },
  // mixin injeta campos de correlação de forma transparente em cada log
  mixin() {
    const ctx = _getCtx();
    if (!ctx) return {};
    const { correlationId, traceId, userId, requestId } = ctx.getStore();
    return {
      ...(correlationId ? { correlationId } : {}),
      ...(traceId       ? { traceId }       : {}),
      ...(userId        ? { userId }         : {}),
      ...(requestId     ? { requestId }      : {}),
    };
  },
  redact: {
    paths:  [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.senha',
      '*.email',
      '*.cpf',
      '*.telefone',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ── Middleware HTTP (pino-http) ───────────────────────────────────
// Ignora health checks para não poluir os logs com noise operacional.
// Nível por status code: 5xx=error, 4xx=warn, 2xx/3xx=info.
const loggerMiddleware = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) =>
      req.url === '/api/health'        ||
      req.url === '/api/v1/health'     ||
      req.url === '/health/live'       ||
      req.url === '/health/ready',
  },
  customLogLevel: (_req, res) =>
    res.statusCode >= 500 ? 'error'
    : res.statusCode >= 400 ? 'warn'
    : 'info',
  // Adiciona correlationId/traceId nos logs HTTP como campos de primeiro nível
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (_req, res, err) =>
    `HTTP error ${res.statusCode}: ${err.message}`,
});

module.exports = { logger, loggerMiddleware };
