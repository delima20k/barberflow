'use strict';

// =============================================================
// LoggerService.js — Logger estruturado centralizado (Pino).
// Camada: infra
//
// Pino é ~5x mais rápido que Winston e produz JSON em produção,
// legível em desenvolvimento com pino-pretty (opcional).
//
// Uso:
//   const logger = require('./LoggerService');
//   logger.info({ userId }, 'Usuário autenticado');
//   logger.error({ err }, 'Falha ao criar agendamento');
// =============================================================

const pino = require('pino');

const IS_PROD = process.env.APP_ENV === 'production';

/** @type {import('pino').Logger} */
const logger = pino({
  level: process.env.LOG_LEVEL ?? (IS_PROD ? 'info' : 'debug'),

  // Em produção: JSON puro (ideal para Datadog, CloudWatch, GCP Logging)
  // Em desenvolvimento: saída legível via pino-pretty (se disponível)
  transport: IS_PROD
    ? undefined
    : (() => {
        try {
          require.resolve('pino-pretty');
          return { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } };
        } catch {
          return undefined; // pino-pretty não instalado — usa JSON mesmo em dev
        }
      })(),

  // Campos base em todas as mensagens
  base: {
    pid:  process.pid,
    env:  process.env.APP_ENV ?? 'development',
  },

  // Redact: campos sensíveis nunca aparecem nos logs
  redact: {
    paths: [
      // Headers HTTP
      'req.headers.authorization',
      'req.headers.cookie',
      // Tokens e credenciais em body
      'body.password',
      'body.password_hash',
      'body.senha',
      'body.token',
      'body.access_token',
      'body.refresh_token',
      // Tokens em qualquer nível de profundidade
      '*.access_token',
      '*.refresh_token',
      '*.password',
      // PII
      '*.email',
      '*.cpf',
      '*.telefone',
      '*.senha',
    ],
    censor: '[REDACTED]',
  },

  // Timestamp ISO para correlação com outros sistemas
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
