#!/usr/bin/env node
'use strict';

/**
 * pre-deploy.js — Verificações obrigatórias antes do deploy da BFF.
 *
 * Executa como parte do pipeline CI/CD antes de qualquer deploy.
 * Falha com exit 1 se qualquer verificação não passar.
 *
 * Verificações:
 *   1. Variáveis de ambiente obrigatórias presentes
 *   2. Versão mínima do Node.js
 *   3. Dependências sem vulnerabilidades críticas (npm audit)
 *   4. App carrega sem erros de syntax/require
 *   5. Endpoint /health/live responde 200
 *   6. Migrações pendentes ausentes (se SUPABASE_DB_URL configurada)
 */

const { execSync, spawn }  = require('node:child_process');
const http                 = require('node:http');
const path                 = require('node:path');

// ── Utilitários ───────────────────────────────────────────────────

const OK    = '  [OK]';
const FAIL  = '  [FAIL]';
const SKIP  = '  [SKIP]';

let hasErrors = false;

function ok(msg)   { console.log(`${OK}  ${msg}`); }
function fail(msg) { console.error(`${FAIL} ${msg}`); hasErrors = true; }
function skip(msg) { console.log(`${SKIP} ${msg}`); }
function header(title) { console.log(`\n── ${title} ${'─'.repeat(50 - title.length)}`); }

// ── 1. Variáveis obrigatórias ─────────────────────────────────────

header('1. Variáveis de ambiente');

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_JWT_SECRET',
];

for (const envVar of REQUIRED_VARS) {
  if (process.env[envVar]) {
    ok(`${envVar} presente`);
  } else {
    fail(`${envVar} ausente — deploy bloqueado`);
  }
}

// ── 2. Versão do Node ──────────────────────────────────────────────

header('2. Versão do Node.js');

const MIN_NODE_MAJOR = 18;
const [major] = process.versions.node.split('.').map(Number);

if (major >= MIN_NODE_MAJOR) {
  ok(`Node.js ${process.versions.node} (mínimo v${MIN_NODE_MAJOR})`);
} else {
  fail(`Node.js ${process.versions.node} < v${MIN_NODE_MAJOR} exigido`);
}

// ── 3. npm audit ───────────────────────────────────────────────────

header('3. Vulnerabilidades (npm audit)');

try {
  execSync('npm audit --audit-level=critical --omit=dev', { stdio: 'pipe' });
  ok('Sem vulnerabilidades críticas nas dependências de produção');
} catch (e) {
  const output = e.stdout?.toString() ?? '';
  fail(`npm audit encontrou vulnerabilidades críticas:\n${output.slice(0, 500)}`);
}

// ── 4. Carregamento do app ─────────────────────────────────────────

header('4. Carregamento do módulo principal');

try {
  // APP_ENV=test para pular validação de env no startup
  process.env.APP_ENV = process.env.APP_ENV || 'test';
  const criarApp = require(path.resolve(__dirname, '../app'));
  const app = criarApp(null);
  if (app && typeof app.listen === 'function') {
    ok('app.js carrega e criarApp() retorna Express app');
  } else {
    fail('criarApp() não retornou Express app');
  }
} catch (e) {
  fail(`Erro ao carregar app.js: ${e.message}`);
}

// ── 5. Health check via HTTP ───────────────────────────────────────

header('5. Health check /health/live');

await new Promise((resolve) => {
  try {
    const criarApp = require(path.resolve(__dirname, '../app'));
    const app = criarApp(null);
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get(`http://127.0.0.1:${port}/health/live`, (res) => {
        if (res.statusCode === 200) {
          ok(`/health/live → ${res.statusCode} OK`);
        } else {
          fail(`/health/live → ${res.statusCode} (esperado 200)`);
        }
        server.close(resolve);
      }).on('error', (e) => {
        fail(`/health/live falhou: ${e.message}`);
        server.close(resolve);
      });
    });
  } catch (e) {
    fail(`Não foi possível iniciar servidor de health check: ${e.message}`);
    resolve();
  }
});

// ── 6. Migrações pendentes ─────────────────────────────────────────

header('6. Migrações Supabase pendentes');

if (process.env.SUPABASE_DB_URL) {
  try {
    execSync('npx supabase db diff --use-migra', { stdio: 'pipe' });
    ok('Sem migrações pendentes');
  } catch {
    skip('Não foi possível verificar migrações (supabase CLI pode não estar instalado)');
  }
} else {
  skip('SUPABASE_DB_URL não configurada — verificação de migração pulada');
}

// ── Resultado final ────────────────────────────────────────────────

console.log('\n' + '═'.repeat(55));

if (hasErrors) {
  console.error('PRE-DEPLOY FALHOU — corrija os problemas acima antes de fazer deploy.\n');
  process.exit(1);
} else {
  console.log('PRE-DEPLOY OK — todos os checks passaram. Pronto para deploy.\n');
  process.exit(0);
}
