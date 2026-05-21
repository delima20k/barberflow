'use strict';

/**
 * env.js — Configuração 12-factor para a BFF.
 *
 * Valida todas as variáveis de ambiente obrigatórias no boot.
 * Se alguma estiver ausente ou inválida, o processo encerra imediatamente
 * com mensagem clara (fail-fast), evitando erros silenciosos em runtime.
 *
 * Uso:
 *   const { env } = require('./config/env');
 *   console.log(env.SUPABASE_URL);
 */

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NODE_ENV',
];

const OPTIONAL_DEFAULTS = {
  PORT:          '3001',
  LOG_LEVEL:     'info',
  CORS_ORIGINS:  '*',
  CACHE_DRIVER:  'memory',   // 'memory' | 'redis'
  REDIS_URL:     '',
  JWT_SECRET:    '',
};

function validate() {
  const missing = REQUIRED.filter(key => !process.env[key]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[BarberFlow BFF] Variáveis de ambiente obrigatórias ausentes:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  const nodeEnv = process.env.NODE_ENV;
  if (!['development', 'test', 'staging', 'production'].includes(nodeEnv)) {
    // eslint-disable-next-line no-console
    console.error(`[BarberFlow BFF] NODE_ENV inválido: "${nodeEnv}". Use development | test | staging | production`);
    process.exit(1);
  }

  if (process.env.CACHE_DRIVER === 'redis' && !process.env.REDIS_URL) {
    // eslint-disable-next-line no-console
    console.error('[BarberFlow BFF] CACHE_DRIVER=redis requer REDIS_URL');
    process.exit(1);
  }
}

/**
 * @type {{
 *   NODE_ENV:                  'development'|'test'|'staging'|'production',
 *   PORT:                      number,
 *   SUPABASE_URL:              string,
 *   SUPABASE_SERVICE_ROLE_KEY: string,
 *   LOG_LEVEL:                 string,
 *   CORS_ORIGINS:              string,
 *   CACHE_DRIVER:              'memory'|'redis',
 *   REDIS_URL:                 string,
 *   JWT_SECRET:                string,
 *   isProduction:              boolean,
 *   isTest:                    boolean,
 *   isDevelopment:             boolean,
 * }}
 */
let env;

function load() {
  validate();

  for (const [key, defaultVal] of Object.entries(OPTIONAL_DEFAULTS)) {
    if (!process.env[key]) process.env[key] = defaultVal;
  }

  env = Object.freeze({
    NODE_ENV:                  process.env.NODE_ENV,
    PORT:                      parseInt(process.env.PORT, 10),
    SUPABASE_URL:              process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LOG_LEVEL:                 process.env.LOG_LEVEL,
    CORS_ORIGINS:              process.env.CORS_ORIGINS,
    CACHE_DRIVER:              process.env.CACHE_DRIVER,
    REDIS_URL:                 process.env.REDIS_URL,
    JWT_SECRET:                process.env.JWT_SECRET,
    isProduction:  process.env.NODE_ENV === 'production',
    isTest:        process.env.NODE_ENV === 'test',
    isDevelopment: process.env.NODE_ENV === 'development',
  });

  return env;
}

// Singleton — já valida ao importar em produção
if (process.env.NODE_ENV !== 'test') load();

module.exports = { load, get env() { return env; } };
