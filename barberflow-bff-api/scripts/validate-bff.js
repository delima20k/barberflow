'use strict';

// ================================================================
// scripts/validate-bff.js — Diagnóstico pré-deploy da BFF.
//
// Uso: node scripts/validate-bff.js
//      npm run validate:bff
//
// Verifica:
//   1. Arquivos críticos existem
//   2. package.json tem dependencies
//   3. vercel.json tem functions + includeFiles
//   4. Chain de imports resolvida (sem MODULE_NOT_FOUND)
//   5. Variáveis de ambiente (warn se ausentes)
//
// Código de saída:
//   0 — tudo ok
//   1 — erro(s) encontrado(s)
// ================================================================

const path = require('node:path');
const fs   = require('node:fs');

const ROOT  = path.resolve(__dirname, '..');
const VERDE  = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const AMARELO  = '\x1b[33m';
const RESET  = '\x1b[0m';
const NEGRITO = '\x1b[1m';

let erros = 0;
let avisos = 0;

// ── Helpers ───────────────────────────────────────────────────────

function ok(msg)   { process.stdout.write(`  ${VERDE}✓${RESET} ${msg}\n`); }
function fail(msg) { process.stdout.write(`  ${VERMELHO}✗${RESET} ${VERMELHO}${msg}${RESET}\n`); erros++; }
function warn(msg) { process.stdout.write(`  ${AMARELO}⚠${RESET} ${AMARELO}${msg}${RESET}\n`); avisos++; }
function secao(titulo) { process.stdout.write(`\n${NEGRITO}${titulo}${RESET}\n`); }

function existe(relativo) {
  return fs.existsSync(path.join(ROOT, relativo));
}

// ── 1. Arquivos críticos ──────────────────────────────────────────

secao('1. Arquivos críticos');

const ARQUIVOS_CRITICOS = [
  'package.json',
  'vercel.json',
  'app.js',
  'server.js',
  'api/index.js',
  'api/v1/router.js',
  'config/index.js',
  'config/environments/production.js',
  'config/environments/development.js',
  'middlewares/cors.js',
  'middlewares/logger.js',
  'middlewares/rateLimiter.js',
  'middlewares/timeout.js',
  'middlewares/errorHandler.js',
  'middlewares/auth.js',
  'routes/health.js',
  'routes/barbearias.js',
  'routes/clientes.js',
  'controllers/BarbeariaController.js',
  'controllers/HealthController.js',
  'controllers/GeoController.js',
  'controllers/BaseController.js',
  'services/BarbeariaService.js',
  'services/GeoService.js',
  'repositories/BarbeariaRepository.js',
  'repositories/GeoRepository.js',
  'utils/SupabaseClient.js',
  'utils/AppError.js',
  'utils/ApiResponse.js',
];

for (const arquivo of ARQUIVOS_CRITICOS) {
  if (existe(arquivo)) {
    ok(arquivo);
  } else {
    fail(`${arquivo} — ARQUIVO NÃO ENCONTRADO`);
  }
}

// ── 2. package.json — dependencies ───────────────────────────────

secao('2. package.json');

const pkgPath = path.join(ROOT, 'package.json');
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (e) {
  fail(`Não foi possível ler package.json: ${e.message}`);
  pkg = {};
}

const DEPS_OBRIGATORIAS = [
  '@supabase/supabase-js',
  'compression',
  'express',
  'express-rate-limit',
  'helmet',
  'jsonwebtoken',
  'pino',
  'pino-http',
];

const deps = pkg.dependencies ?? {};
if (Object.keys(deps).length === 0) {
  fail('Campo "dependencies" ausente ou vazio — npm install não instalará nada');
} else {
  ok(`"dependencies" presente (${Object.keys(deps).length} pacotes)`);
}

for (const dep of DEPS_OBRIGATORIAS) {
  if (deps[dep]) {
    ok(`  dep: ${dep}@${deps[dep]}`);
  } else {
    fail(`  dep ausente: ${dep}`);
  }
}

if (!pkg.scripts?.['validate:bff']) warn('Script "validate:bff" ausente em package.json');
else ok('Script "validate:bff" configurado');

if (!pkg.engines?.node) warn('"engines.node" não definido — Vercel pode usar versão incompatível');
else ok(`"engines.node": "${pkg.engines.node}"`);

// ── 3. vercel.json ────────────────────────────────────────────────

secao('3. vercel.json');

const vercelPath = path.join(ROOT, 'vercel.json');
let vercelCfg;
try {
  vercelCfg = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
} catch (e) {
  fail(`Não foi possível ler vercel.json: ${e.message}`);
  vercelCfg = {};
}

if (vercelCfg.version === 2) {
  ok('version: 2');
} else {
  fail(`version inválida: ${vercelCfg.version} (esperado 2)`);
}

const funcEntry = vercelCfg.functions?.['api/index.js'];
if (!funcEntry) {
  fail('"functions[api/index.js]" ausente — Vercel não bundlará arquivos fora de api/');
} else {
  ok('"functions[api/index.js]" configurado');
  if (funcEntry.includeFiles) {
    ok(`  includeFiles: "${funcEntry.includeFiles}"`);
  } else {
    fail('  "includeFiles" ausente — arquivos como app.js, controllers/ etc. não serão incluídos');
  }
}

const rewrites = vercelCfg.rewrites ?? [];
const temRewrite = rewrites.some((r) => r.destination === '/api' || r.destination === '/api/index');
if (temRewrite) ok('rewrite /(.*) → /api configurado');
else warn('Nenhum rewrite apontando para /api encontrado em vercel.json');

// ── 4. Chain de imports ───────────────────────────────────────────

secao('4. Chain de imports (resolução de módulos)');

const CADEIA = [
  { de: 'api/index.js',       importa: '../app' },
  { de: 'app.js',             importa: './api/v1/router' },
  { de: 'app.js',             importa: './routes/health' },
  { de: 'app.js',             importa: './middlewares/cors' },
  { de: 'app.js',             importa: './middlewares/logger' },
  { de: 'app.js',             importa: './middlewares/rateLimiter' },
  { de: 'app.js',             importa: './middlewares/timeout' },
  { de: 'app.js',             importa: './middlewares/errorHandler' },
  { de: 'app.js',             importa: './config' },
  { de: 'routes/barbearias.js', importa: '../utils/SupabaseClient' },
  { de: 'routes/barbearias.js', importa: '../repositories/BarbeariaRepository' },
  { de: 'routes/barbearias.js', importa: '../services/BarbeariaService' },
  { de: 'routes/barbearias.js', importa: '../controllers/BarbeariaController' },
  { de: 'routes/clientes.js',   importa: '../controllers/GeoController' },
  { de: 'routes/clientes.js',   importa: '../services/GeoService' },
  { de: 'routes/clientes.js',   importa: '../repositories/GeoRepository' },
];

for (const { de, importa } of CADEIA) {
  const baseDir  = path.dirname(path.join(ROOT, de));
  const candidatos = [
    path.join(baseDir, importa + '.js'),
    path.join(baseDir, importa, 'index.js'),
  ];
  const resolvido = candidatos.find((c) => fs.existsSync(c));
  if (resolvido) {
    ok(`${de} → ${importa}`);
  } else {
    fail(`${de} → ${importa}  [ARQUIVO NÃO ENCONTRADO]`);
  }
}

// ── 5. Variáveis de ambiente ──────────────────────────────────────

secao('5. Variáveis de ambiente (produção)');

const ENV_OBRIGATORIAS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const ENV_OPCIONAIS = [
  'SUPABASE_JWT_SECRET',
  'APP_ENV',
  'LOG_LEVEL',
  'REQUEST_TIMEOUT_MS',
];

for (const v of ENV_OBRIGATORIAS) {
  if (process.env[v]) ok(`${v} definida`);
  else warn(`${v} não definida — necessária em produção`);
}
for (const v of ENV_OPCIONAIS) {
  if (process.env[v]) ok(`${v} = "${process.env[v]}"`);
  else ok(`${v} não definida (opcional — usa default)`);
}

// ── Resultado final ───────────────────────────────────────────────

process.stdout.write('\n' + '─'.repeat(50) + '\n');

if (erros === 0 && avisos === 0) {
  process.stdout.write(`\n${VERDE}${NEGRITO}✓ BFF pronta para deploy — nenhum problema encontrado.${RESET}\n\n`);
  process.exit(0);
} else if (erros === 0) {
  process.stdout.write(`\n${AMARELO}${NEGRITO}⚠ BFF com ${avisos} aviso(s) — revisar antes do deploy.${RESET}\n\n`);
  process.exit(0);
} else {
  process.stdout.write(`\n${VERMELHO}${NEGRITO}✗ ${erros} erro(s) encontrado(s) — CORRIGIR antes do deploy.${RESET}\n`);
  if (avisos > 0) process.stdout.write(`${AMARELO}  + ${avisos} aviso(s).${RESET}\n`);
  process.stdout.write('\n');
  process.exit(1);
}
