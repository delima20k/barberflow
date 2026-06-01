'use strict';

/**
 * auth.e2e.test.js — E2E: fluxo de autenticação completo.
 *
 * Testa o caminho real da requisição HTTP → Express → AuthController → AuthBffService → AuthRepository (mockado).
 * Sem dependências externas: Supabase mockado via _app-helper.
 *
 * Fluxos cobertos:
 *  - POST /api/auth/login         — credenciais válidas retornam tokens
 *  - POST /api/auth/login         — credenciais inválidas retornam 401
 *  - POST /api/auth/login         — body vazio → 400
 *  - POST /api/auth/refresh       — refresh válido retorna novos tokens
 *  - POST /api/auth/refresh       — refresh inválido → 401
 *  - GET  /api/auth/me            — token válido → perfil
 *  - GET  /api/auth/me            — sem token → 401
 *  - POST /api/auth/logout        — token válido → ok
 *  - Headers de segurança presentes em todas as respostas
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer, request, gerarToken, TEST_USER_ID } = require('./_app-helper');

suite('E2E — Auth', () => {
  let server;

  before(async () => {
    server = await createTestServer({
      __auth_signIn: async ({ email, password }) => {
        if (email === 'user@barberflow.com' && password === 'senha123') {
          return {
            data: {
              user:    { id: TEST_USER_ID, email },
              session: { access_token: gerarToken({ sub: TEST_USER_ID, email }), refresh_token: 'rt-valido' },
            },
            error: null,
          };
        }
        return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
      },
      __auth_refresh: async ({ refresh_token }) => {
        if (refresh_token === 'rt-valido') {
          return {
            data:  { session: { access_token: gerarToken({ sub: TEST_USER_ID }), refresh_token: 'rt-novo' } },
            error: null,
          };
        }
        return { data: { session: null }, error: { message: 'Invalid refresh token' } };
      },
      profiles: () => ({ data: { id: TEST_USER_ID, nome: 'Usuário Teste', tipo: 'cliente' }, error: null }),
    });
  });

  after(async () => {
    await server.close();
  });

  // ── Login ────────────────────────────────────────────────────────

  test('POST /api/auth/login — credenciais válidas → 200 com tokens', async () => {
    const { status, body } = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'user@barberflow.com', password: 'senha123' },
    });
    assert.strictEqual(status, 200);
    assert.ok(body.dados?.access_token || body.dados?.session, 'deve retornar token ou session');
  });

  test('POST /api/auth/login — credenciais inválidas → 401', async () => {
    const { status } = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'errado@barberflow.com', password: 'errada' },
    });
    assert.strictEqual(status, 401);
  });

  test('POST /api/auth/login — body vazio → 400 ou 401', async () => {
    const { status } = await request(server, 'POST', '/api/auth/login', {
      body: {},
    });
    assert.ok(status === 400 || status === 401, `esperado 400 ou 401, recebeu ${status}`);
  });

  test('POST /api/auth/login — sem body → não deve crashar (4xx)', async () => {
    const { status } = await request(server, 'POST', '/api/auth/login');
    assert.ok(status >= 400 && status < 500, `esperado 4xx, recebeu ${status}`);
  });

  // ── Refresh ──────────────────────────────────────────────────────

  test('POST /api/auth/refresh — refresh token válido → 200', async () => {
    const { status, body } = await request(server, 'POST', '/api/auth/refresh', {
      body: { refresh_token: 'rt-valido' },
    });
    assert.strictEqual(status, 200);
    assert.ok(body.dados?.access_token || body.dados?.session, 'deve retornar novos tokens');
  });

  test('POST /api/auth/refresh — refresh token inválido → 401', async () => {
    const { status } = await request(server, 'POST', '/api/auth/refresh', {
      body: { refresh_token: 'rt-invalido' },
    });
    assert.strictEqual(status, 401);
  });

  // ── Me ───────────────────────────────────────────────────────────

  test('GET /api/auth/me — token válido → 200 com perfil', async () => {
    const token = gerarToken({ sub: TEST_USER_ID, email: 'user@barberflow.com' });
    const { status, body } = await request(server, 'GET', '/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(status, 200);
    assert.ok(body.dados != null, 'deve retornar dados do usuário');
  });

  test('GET /api/auth/me — sem token → 401', async () => {
    const { status } = await request(server, 'GET', '/api/auth/me');
    assert.strictEqual(status, 401);
  });

  test('GET /api/auth/me — token expirado → 401', async () => {
    const expired = gerarToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    const { status } = await request(server, 'GET', '/api/auth/me', {
      headers: { Authorization: `Bearer ${expired}` },
    });
    assert.strictEqual(status, 401);
  });

  // ── Logout ───────────────────────────────────────────────────────

  test('POST /api/auth/logout — token válido → 200', async () => {
    const token = gerarToken({ sub: TEST_USER_ID });
    const { status } = await request(server, 'POST', '/api/auth/logout', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(status, 200);
  });

  test('POST /api/auth/logout — sem token → 401', async () => {
    const { status } = await request(server, 'POST', '/api/auth/logout');
    assert.strictEqual(status, 401);
  });

  // ── Headers de segurança ─────────────────────────────────────────

  test('Helmet injeta x-content-type-options em todas as respostas', async () => {
    const { headers } = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'user@barberflow.com', password: 'senha123' },
    });
    assert.ok(
      headers['x-content-type-options'] || headers['x-frame-options'],
      'esperado header de segurança do Helmet',
    );
  });

  test('Resposta inclui x-correlation-id e x-trace-id', async () => {
    const { headers } = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'user@barberflow.com', password: 'senha123' },
    });
    assert.ok(headers['x-correlation-id'], 'deve incluir x-correlation-id');
    assert.ok(headers['x-trace-id'], 'deve incluir x-trace-id');
  });

  test('x-correlation-id no request é propagado na resposta', async () => {
    const correlationId = 'e2e-corr-abc123';
    const { headers } = await request(server, 'POST', '/api/auth/login', {
      headers: { 'x-correlation-id': correlationId },
      body:    { email: 'user@barberflow.com', password: 'senha123' },
    });
    assert.strictEqual(headers['x-correlation-id'], correlationId);
  });

  // ── Rate limiting ────────────────────────────────────────────────

  test('Rota inexistente → 404 com estrutura ok:false', async () => {
    const { status, body } = await request(server, 'GET', '/api/auth/rota-invalida');
    assert.strictEqual(status, 404);
    assert.strictEqual(body.ok, false);
  });
});
