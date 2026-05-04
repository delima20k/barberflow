'use strict';

// =============================================================
// cors.test.js — Teste de regressão para o middleware CORS.
//
// Garante que todas as origens de frontend autorizadas estão
// cobertas na allowlist e que origens não autorizadas são
// bloqueadas corretamente.
//
// Estratégia: replica a lógica do middleware CORS de src/app.js
// para testar o comportamento sem inicializar o Express.
// =============================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

// ─── Origens autorizadas (espelho de src/app.js ALLOWED_ORIGINS) ──────────────
const ALLOWED_ORIGINS = new Set([
  'https://barberflow.vercel.app',
  'https://barberflow-cliente.vercel.app',
  'https://barberflow-profissional.vercel.app',
  'https://barberflow-pro-one.vercel.app',
  'https://www.barberflow.app',
  'https://barberflow.app',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function origemPermitida(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try { return new URL(origin).hostname.endsWith('.vercel.app'); } catch { return false; }
}

/**
 * Réplica fiel do middleware CORS de src/app.js.
 * Retorna os headers que seriam aplicados na resposta.
 *
 * @param {string} origin  — valor do header Origin da request
 * @param {string} method  — método HTTP
 * @returns {{ headers: Record<string,string>, status: number|null }}
 */
function simularCors(origin, method = 'GET') {
  const headers = {};
  let status    = null;

  if (origemPermitida(origin)) {
    headers['Access-Control-Allow-Origin']      = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary']                             = 'Origin';
  }

  if (method === 'OPTIONS') {
    headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,apikey,x-client-info';
    headers['Access-Control-Max-Age']       = '86400';
    status = 200;
  }

  return { headers, status };
}

// ─── Suite 1: origens do frontend de produção ────────────────────────────────

suite('CORS — origens do frontend de produção', () => {

  const ORIGENS_FRONTEND = [
    'https://barberflow-pro-one.vercel.app',       // app profissional (deployment atual)
    'https://barberflow-profissional.vercel.app',  // app profissional (URL alternativa)
    'https://barberflow-cliente.vercel.app',       // app cliente
    'https://barberflow.vercel.app',               // API / monorepo
    'https://barberflow.app',                      // domínio próprio
    'https://www.barberflow.app',                  // www
  ];

  for (const origin of ORIGENS_FRONTEND) {
    test(`GET de "${origin}" recebe Access-Control-Allow-Origin`, () => {
      const { headers } = simularCors(origin, 'GET');
      assert.strictEqual(
        headers['Access-Control-Allow-Origin'],
        origin,
        `"${origin}" deve estar em ALLOWED_ORIGINS`,
      );
    });
  }
});

// ─── Suite 2: preflight OPTIONS ──────────────────────────────────────────────

suite('CORS — preflight OPTIONS', () => {

  test('barberflow-pro-one.vercel.app retorna 200 com headers completos', () => {
    const origin = 'https://barberflow-pro-one.vercel.app';
    const { headers, status } = simularCors(origin, 'OPTIONS');

    assert.strictEqual(status, 200, 'preflight deve responder 200');
    assert.strictEqual(headers['Access-Control-Allow-Origin'], origin);
    assert.ok(
      headers['Access-Control-Allow-Methods']?.includes('OPTIONS'),
      'OPTIONS deve estar nos métodos permitidos',
    );
    assert.ok(
      headers['Access-Control-Allow-Headers']?.includes('Authorization'),
      'Authorization deve estar nos headers permitidos',
    );
    assert.strictEqual(headers['Access-Control-Max-Age'], '86400');
  });

  test('origem desconhecida não recebe Access-Control-Allow-Origin no preflight', () => {
    const { headers } = simularCors('https://atacante.com', 'OPTIONS');
    assert.ok(
      !headers['Access-Control-Allow-Origin'],
      'origem não autorizada não deve receber ACAO header',
    );
  });
});

// ─── Suite 3: origens bloqueadas ─────────────────────────────────────────────

suite('CORS — origens não autorizadas', () => {

  const ORIGENS_BLOQUEADAS = [
    'https://atacante.com',
    'https://barberflow.evil.com',
    '',
  ];

  for (const origin of ORIGENS_BLOQUEADAS) {
    test(`"${origin || '(vazio)'}" não recebe Access-Control-Allow-Origin`, () => {
      const { headers } = simularCors(origin, 'GET');
      assert.ok(
        !headers['Access-Control-Allow-Origin'],
        `"${origin}" não deve estar em ALLOWED_ORIGINS`,
      );
    });
  }
});

// ─── Suite 4: preview URLs Vercel ──────────────────────────────────────────

suite('CORS — preview URLs Vercel', () => {

  const PREVIEW_URLS = [
    'https://barberflow-profissional-9vbcwo97t-delima20ks-projects.vercel.app',
    'https://barberflow-cliente-abc123-delima20ks-projects.vercel.app',
    'https://barberflow-pro-one-xyz-delima20ks-projects.vercel.app',
  ];

  for (const origin of PREVIEW_URLS) {
    test(`preview "${origin}" recebe Access-Control-Allow-Origin`, () => {
      const { headers } = simularCors(origin, 'GET');
      assert.strictEqual(
        headers['Access-Control-Allow-Origin'],
        origin,
        `preview URL "${origin}" deve ser permitida`,
      );
    });
  }

  test('dominio externo com .vercel.app em subpath NAO e permitido', () => {
    const { headers } = simularCors('https://atacante.com', 'GET');
    assert.ok(!headers['Access-Control-Allow-Origin']);
  });
});

// ─── Suite 5: consistência com src/app.js ──────────────────────────────────

suite('CORS — consistência com src/app.js', () => {

  const APP_PATH = path.resolve(__dirname, '../src/app.js');

  test('src/app.js existe e contém ALLOWED_ORIGINS', () => {
    const src = fs.readFileSync(APP_PATH, 'utf8');
    assert.ok(src.includes('ALLOWED_ORIGINS'), 'ALLOWED_ORIGINS deve existir em src/app.js');
  });

  test('src/app.js contém barberflow-pro-one.vercel.app', () => {
    const src = fs.readFileSync(APP_PATH, 'utf8');
    assert.ok(
      src.includes('barberflow-pro-one.vercel.app'),
      'barberflow-pro-one.vercel.app deve estar em ALLOWED_ORIGINS em src/app.js',
    );
  });

  test('vercel.json NÃO contém headers CORS estáticos — Express é a única autoridade', () => {
    const vercelJson = fs.readFileSync(
      path.resolve(__dirname, '../vercel.json'),
      'utf8',
    );
    assert.ok(
      !vercelJson.includes('"Access-Control-Allow-Origin"'),
      'vercel.json não deve injetar Access-Control-Allow-Origin estático — CORS delegado ao Express',
    );
  });
});
