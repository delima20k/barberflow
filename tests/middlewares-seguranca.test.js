'use strict';

// =============================================================
// middlewares-seguranca.test.js — TDD para RoleMiddleware e
// ValidationMiddleware.
//
// Testa: controle de roles, validação de schema, sanitização,
// caching de role, falha do banco, shorthands.
// =============================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const ValidationMiddleware = require('../src/infra/ValidationMiddleware');
const RoleMiddleware       = require('../src/infra/RoleMiddleware');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_1 = '00000000-0000-4000-8000-000000000001';

/**
 * Cria mocks de req/res/next para testes de middleware Express.
 * captured.status → status HTTP definido via res.status()
 * captured.body   → payload enviado via .json()
 */
function criarMocks(opts = {}) {
  const captured = { status: null, body: null };

  const res = {
    status(s) {
      captured.status = s;
      return { json(d) { captured.body = d; } };
    },
    json(d) { captured.body = d; },
  };

  const next = fn();
  const req  = {
    body:    opts.body    ?? {},
    params:  opts.params  ?? {},
    query:   opts.query   ?? {},
    headers: opts.headers ?? {},
    user:    opts.user    != null ? { ...opts.user } : null,
  };

  return { req, res, next, captured };
}

/**
 * Cria mock do supabase para testes de RoleMiddleware.
 * Simula query em profiles para obter role.
 */
function criarSupabaseMock({ role = 'client', dbError = null } = {}) {
  const result = dbError
    ? { data: null, error: dbError }
    : { data: { role },   error: null };

  const builder = {
    select:      fn().mockReturnThis(),
    eq:          fn().mockReturnThis(),
    maybeSingle: fn().mockResolvedValue(result),
  };
  builder.select.mockReturnThis = () => builder;
  builder.eq.mockReturnThis     = () => builder;

  return { from: fn().mockReturnValue(builder) };
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — ValidationMiddleware.corpo()
// ─────────────────────────────────────────────────────────────────────────────

suite('ValidationMiddleware.corpo() — email', () => {

  test('campo email obrigatório ausente → 400', () => {
    const mw = ValidationMiddleware.corpo({
      email: { tipo: 'email', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: {} });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('campo email com formato inválido → 400', () => {
    const mw = ValidationMiddleware.corpo({
      email: { tipo: 'email', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { email: 'nao-e-email' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('campo email válido → next()', () => {
    const mw = ValidationMiddleware.corpo({
      email: { tipo: 'email', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { email: 'user@barberflow.com' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('campo email opcional ausente → next() sem erro', () => {
    const mw = ValidationMiddleware.corpo({
      email: { tipo: 'email', obrigatorio: false },
    });
    const { req, res, next, captured } = criarMocks({ body: {} });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });
});

suite('ValidationMiddleware.params() — uuid', () => {

  test('uuid inválido → 400', () => {
    const mw = ValidationMiddleware.params({
      id: { tipo: 'uuid', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ params: { id: 'nao-uuid' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('uuid válido → next()', () => {
    const mw = ValidationMiddleware.params({
      id: { tipo: 'uuid', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ params: { id: UUID_1 } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });
});

suite('ValidationMiddleware.query() — numero', () => {

  test('número abaixo do min → 400', () => {
    const mw = ValidationMiddleware.query({
      raio: { tipo: 'numero', obrigatorio: true, min: 1, max: 100 },
    });
    const { req, res, next, captured } = criarMocks({ query: { raio: '0' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });

  test('número acima do max → 400', () => {
    const mw = ValidationMiddleware.query({
      raio: { tipo: 'numero', obrigatorio: true, min: 1, max: 100 },
    });
    const { req, res, next, captured } = criarMocks({ query: { raio: '200' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });

  test('número no intervalo → next()', () => {
    const mw = ValidationMiddleware.query({
      raio: { tipo: 'numero', obrigatorio: true, min: 1, max: 100 },
    });
    const { req, res, next, captured } = criarMocks({ query: { raio: '5' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('número não obrigatório ausente → next()', () => {
    const mw = ValidationMiddleware.query({
      raio: { tipo: 'numero', obrigatorio: false, min: 1, max: 100 },
    });
    const { req, res, next, captured } = criarMocks({ query: {} });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('valor não numérico → 400', () => {
    const mw = ValidationMiddleware.query({
      lat: { tipo: 'numero', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ query: { lat: 'abc' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });
});

suite('ValidationMiddleware.corpo() — enum', () => {

  test('valor fora das opcoes → 400', () => {
    const mw = ValidationMiddleware.corpo({
      role: { tipo: 'enum', obrigatorio: true, opcoes: ['client', 'professional'] },
    });
    const { req, res, next, captured } = criarMocks({ body: { role: 'admin_hack' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });

  test('valor dentro das opcoes → next()', () => {
    const mw = ValidationMiddleware.corpo({
      role: { tipo: 'enum', obrigatorio: true, opcoes: ['client', 'professional'] },
    });
    const { req, res, next, captured } = criarMocks({ body: { role: 'client' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });
});

suite('ValidationMiddleware.corpo() — booleano', () => {

  test('string inválida → 400', () => {
    const mw = ValidationMiddleware.corpo({
      ativo: { tipo: 'booleano', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { ativo: 'sim' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });

  test('valor "true" (string) → next()', () => {
    const mw = ValidationMiddleware.corpo({
      ativo: { tipo: 'booleano', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { ativo: 'true' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('valor boolean true (nativo) → next()', () => {
    const mw = ValidationMiddleware.corpo({
      ativo: { tipo: 'booleano', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { ativo: true } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });
});

suite('ValidationMiddleware.corpo() — texto (sanitização)', () => {

  test('texto com espaços → trimado e escrito de volta no body', () => {
    const mw = ValidationMiddleware.corpo({
      bio: { tipo: 'texto', maxLen: 300 },
    });
    const { req, res, next, captured } = criarMocks({ body: { bio: '  meu texto  ' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
    assert.strictEqual(req.body.bio, 'meu texto');
  });

  test('texto com null bytes → removidos e escritos de volta', () => {
    const mw = ValidationMiddleware.corpo({
      bio: { tipo: 'texto', maxLen: 300 },
    });
    const { req, res, next } = criarMocks({ body: { bio: 'hello\0world' } });

    mw(req, res, next);

    assert.strictEqual(req.body.bio, 'helloworld');
  });

  test('texto acima do maxLen → 400', () => {
    const mw = ValidationMiddleware.corpo({
      bio: { tipo: 'texto', maxLen: 5, obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { bio: 'texto muito longo' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });
});

suite('ValidationMiddleware — múltiplos campos', () => {

  test('múltiplos campos inválidos → erro menciona o campo', () => {
    const mw = ValidationMiddleware.corpo({
      email: { tipo: 'email', obrigatorio: true },
      nome:  { tipo: 'nome',  obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { email: 'x', nome: '' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
    // Deve incluir array de erros
    assert.ok(Array.isArray(captured.body?.erros));
    assert.ok(captured.body.erros.length >= 2);
    assert.strictEqual(next.calls.length, 0);
  });

  test('tipo desconhecido → 400 com mensagem sobre o tipo', () => {
    const mw = ValidationMiddleware.corpo({
      campo: { tipo: 'tipo_inexistente', obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { campo: 'qualquer' } });

    mw(req, res, next);

    assert.strictEqual(captured.status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — RoleMiddleware.exigir()
// ─────────────────────────────────────────────────────────────────────────────

suite('RoleMiddleware.exigir() — autenticação', () => {

  test('sem req.user → 401', async () => {
    const mw = RoleMiddleware._comSupabase(null, 'admin');
    const { req, res, next, captured } = criarMocks({ user: null });

    await mw(req, res, next);

    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('req.user sem id → 401', async () => {
    const mw = RoleMiddleware._comSupabase(null, 'admin');
    const { req, res, next, captured } = criarMocks({ user: { email: 'x@y.com' } });

    await mw(req, res, next);

    assert.strictEqual(captured.status, 401);
  });
});

suite('RoleMiddleware.exigir() — role já cacheada', () => {

  test('role="client" para rota que exige "admin" → 403', async () => {
    const mw = RoleMiddleware._comSupabase(null, 'admin');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'u@test.com', role: 'client' },
    });

    await mw(req, res, next);

    assert.strictEqual(captured.status, 403);
    assert.strictEqual(next.calls.length, 0);
  });

  test('role="admin" para rota que exige "admin" → next()', async () => {
    const mw = RoleMiddleware._comSupabase(null, 'admin');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'a@test.com', role: 'admin' },
    });

    await mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('exigir múltiplos roles → aceita qualquer um (role="owner")', async () => {
    const mw = RoleMiddleware._comSupabase(null, 'barber', 'owner', 'manager');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'p@test.com', role: 'owner' },
    });

    await mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('role já cacheada → banco NÃO é consultado', async () => {
    const dbMock = criarSupabaseMock({ role: 'admin' });
    const mw     = RoleMiddleware._comSupabase(dbMock, 'client');
    const { req, res, next } = criarMocks({
      user: { id: UUID_1, email: 'u@test.com', role: 'client' },
    });

    await mw(req, res, next);

    assert.strictEqual(next.calls.length, 1);
    assert.strictEqual(dbMock.from.calls.length, 0);  // banco não chamado
  });
});

suite('RoleMiddleware.exigir() — role buscada no banco', () => {

  test('role ausente no req.user → busca no banco, passa', async () => {
    const dbMock = criarSupabaseMock({ role: 'owner' });
    const mw     = RoleMiddleware._comSupabase(dbMock, 'owner', 'manager');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'p@test.com' },  // sem role
    });

    await mw(req, res, next);

    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
    assert.strictEqual(req.user.role, 'owner');  // cacheada no req
  });

  test('role ausente → busca no banco → role insuficiente → 403', async () => {
    const dbMock = criarSupabaseMock({ role: 'client' });
    const mw     = RoleMiddleware._comSupabase(dbMock, 'admin');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'u@test.com' },
    });

    await mw(req, res, next);

    assert.strictEqual(captured.status, 403);
    assert.strictEqual(next.calls.length, 0);
  });

  test('falha no banco → 503 (fail-safe)', async () => {
    const dbMock = criarSupabaseMock({ dbError: new Error('connection refused') });
    const mw     = RoleMiddleware._comSupabase(dbMock, 'admin');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'u@test.com' },
    });

    await mw(req, res, next);

    assert.strictEqual(captured.status, 503);
    assert.strictEqual(next.calls.length, 0);
  });
});

suite('RoleMiddleware — shorthands', () => {

  test('.profissional aceita barber/owner/manager', async () => {
    for (const role of ['barber', 'owner', 'manager']) {
      const mw = RoleMiddleware._comSupabase(null, 'barber', 'owner', 'manager');
      const { req, res, next, captured } = criarMocks({
        user: { id: UUID_1, email: `${role}@test.com`, role },
      });
      await mw(req, res, next);
      assert.strictEqual(captured.status, null, `role="${role}" deve passar`);
      assert.strictEqual(next.calls.length, 1,  `role="${role}" deve chamar next()`);
    }
  });

  test('.profissional bloqueia "client" → 403', async () => {
    const mw = RoleMiddleware._comSupabase(null, 'barber', 'owner', 'manager');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_1, email: 'c@test.com', role: 'client' },
    });
    await mw(req, res, next);
    assert.strictEqual(captured.status, 403);
  });
});
