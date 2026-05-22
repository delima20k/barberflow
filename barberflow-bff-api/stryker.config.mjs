/**
 * stryker.config.mjs — Configuração do Stryker Mutation Testing.
 *
 * Foco nos arquivos de lógica de negócio críticos:
 *   - controllers/
 *   - application/ (use cases/services)
 *   - domain/      (entities/value objects)
 *   - validators/
 *   - utils/AppError.js, utils/ApiResponse.js
 *
 * Executa com node:test runner (nativo Node.js — sem Jest/Vitest).
 *
 * Instalação:
 *   npm install --save-dev @stryker-mutator/core @stryker-mutator/node-test-runner
 *
 * Uso:
 *   npx stryker run
 *   npx stryker run --reporters progress,html
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // ── Test runner ──────────────────────────────────────────────────
  testRunner: 'node',
  nodeTestRunner: {
    // Arquivos de teste unitários e de integração (excluindo E2E que são lentos)
    files: [
      'tests/unit/**/*.test.js',
      'tests/*.test.js',
    ],
    // Excluir testes que dependem de rede ou servidor externo
    exclude: [
      'tests/e2e/**',
      'tests/contract/**',
      'tests/integration/**',
    ],
  },

  // ── Arquivos de produção a mutar ─────────────────────────────────
  mutate: [
    'controllers/**/*.js',
    'application/**/*.js',
    'domain/**/*.js',
    'validators/**/*.js',
    'utils/AppError.js',
    'utils/ApiResponse.js',
    'middlewares/errorHandler.js',
    'middlewares/auth.js',

    // Excluir arquivos de config, bootstrap e infra externa
    '!application/**/index.js',
    '!**/*.config.js',
    '!**/container/**',
    '!infrastructure/supabase/**',
  ],

  // ── Thresholds de qualidade ──────────────────────────────────────
  thresholds: {
    // Mutation score mínimo para CI não falhar
    high:  80,
    low:   60,
    break: 50, // Falha o pipeline se cair abaixo de 50%
  },

  // ── Reporters ────────────────────────────────────────────────────
  reporters: ['progress', 'clear-text', 'html'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation-report.html',
  },

  // ── Concorrência ─────────────────────────────────────────────────
  // Limitar workers para não sobrecarregar CI
  concurrency: 2,

  // ── Cache ────────────────────────────────────────────────────────
  incrementalFile: 'reports/mutation/.stryker-tmp/incremental.json',

  // ── Timeouts ─────────────────────────────────────────────────────
  timeoutMS: 10000,
  timeoutFactor: 1.5,

  // ── Mutadores habilitados ────────────────────────────────────────
  // Foco nos mutadores mais reveladores para APIs REST
  mutator: {
    plugins:        [],
    excludedMutations: [
      'StringLiteral',  // Strings de log não são críticas
    ],
  },
};
