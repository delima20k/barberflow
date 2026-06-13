'use strict';

/**
 * admin-login.test.js — Testes de validação do endpoint POST /api/v1/admin/login.
 *
 * Cobre os 5 cenários obrigatórios do fix do erro 500:
 *   1. Credenciais corretas            → 200 + token JWT
 *   2. Senha errada                    → 401 (mensagem uniforme)
 *   3. Email inexistente               → 401 (mesma mensagem que #2)
 *   4. Payload incompleto (sem senha)  → 400 (não 500)
 *   5. Regressão: auth comum inalterada → AdminService não toca auth Supabase
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const http   = require('node:http');

// ── Configura env vars ANTES de importar o app ───────────────────
// Variáveis Supabase (fake) obrigatórias para o app iniciar
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

// Variáveis admin — causa raiz do erro 500 quando ausentes
const ADMIN_EMAIL  = 'admin-test@barberflow.com';
const ADMIN_SENHA  = 'SenhaAdmin!Segura99';
const ADMIN_HASH   = bcrypt.hashSync(ADMIN_SENHA, 4); // rounds baixo para rapidez
const ADMIN_SECRET = 'test-jwt-secret-admin-min32chars-ok!';

process.env.ADMIN_EMAIL         = ADMIN_EMAIL;
process.env.ADMIN_PASSWORD_HASH = ADMIN_HASH;
process.env.ADMIN_JWT_SECRET    = ADMIN_SECRET;

const criarApp = require('../app');

// ── Helpers ───────────────────────────────────────────────────────

let server;
let port;

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data    = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(options, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Suíte ─────────────────────────────────────────────────────────

suite('POST /api/v1/admin/login', () => {

  before(async () => {
    const app = criarApp();
    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      server.close(err => err ? reject(err) : resolve())
    );
  });

  test('1) credenciais corretas → 200 + token JWT', async () => {
    const { status, body } = await post('/api/v1/admin/login', {
      email: ADMIN_EMAIL,
      senha: ADMIN_SENHA,
    });
    assert.equal(status, 200, `esperado 200, obtido ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);
    assert.ok(typeof body.token === 'string' && body.token.length > 20,
      `token JWT deve estar presente: ${JSON.stringify(body)}`);
  });

  test('2) senha errada → 401 com mensagem uniforme (não 500)', async () => {
    const { status, body } = await post('/api/v1/admin/login', {
      email: ADMIN_EMAIL,
      senha: 'SenhaErradaTotal!999',
    });
    assert.equal(status, 401, `esperado 401, obtido ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Credenciais inválidas.',
      'mensagem deve ser uniforme para evitar enumeração de usuários');
  });

  test('3) email inexistente → 401 mesma mensagem do teste 2', async () => {
    const { status, body } = await post('/api/v1/admin/login', {
      email: 'nao-existe@barberflow.com',
      senha: 'QualquerSenha!456',
    });
    assert.equal(status, 401, `esperado 401, obtido ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Credenciais inválidas.',
      'mensagem deve ser idêntica à do teste 2 — não diferenciar usuário inexistente de senha errada');
  });

  test('4) payload sem senha → 400 (não 500)', async () => {
    const { status, body } = await post('/api/v1/admin/login', {
      email: ADMIN_EMAIL,
      // senha ausente intencionalmente
    });
    assert.equal(status, 400,
      `payload sem senha deve retornar 400 (payload inválido), obtido ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, false);
    assert.notEqual(status, 500, 'payload incompleto nunca deve retornar 500');
  });

  test('4b) payload sem email → 400 (não 500)', async () => {
    const { status, body } = await post('/api/v1/admin/login', {
      // email ausente intencionalmente
      senha: ADMIN_SENHA,
    });
    assert.equal(status, 400,
      `payload sem email deve retornar 400, obtido ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, false);
    assert.notEqual(status, 500, 'payload incompleto nunca deve retornar 500');
  });

  test('5) regressão: AdminService.login não toca auth de usuário comum', () => {
    const path = require('node:path');
    const fs   = require('node:fs');
    const src  = fs.readFileSync(
      path.join(__dirname, '../application/admin/AdminService.js'), 'utf8'
    );
    // Admin login usa env vars + bcrypt + JWT próprio, não Supabase Auth
    assert.ok(!src.includes('AuthRepository'),
      'AdminService não deve importar AuthRepository');
    assert.ok(!src.includes('supabase.auth.signIn'),
      'AdminService não deve chamar Supabase Auth');
    assert.ok(!src.includes('auth.signInWithPassword'),
      'AdminService não deve chamar signInWithPassword');
    // Garante que usa as env vars corretas
    assert.ok(src.includes('ADMIN_EMAIL'),
      'AdminService deve ler ADMIN_EMAIL do env');
    assert.ok(src.includes('ADMIN_PASSWORD_HASH'),
      'AdminService deve ler ADMIN_PASSWORD_HASH do env');
    assert.ok(src.includes('ADMIN_JWT_SECRET'),
      'AdminService deve ler ADMIN_JWT_SECRET do env');
  });

});
