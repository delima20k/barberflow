'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const { criarMocks, gerarTokenSupa, UUID_TEST, SUPA_SECRET } = require('./_helpers');

// ── Configura env antes de importar middlewares ──────────────────
process.env.SUPABASE_JWT_SECRET       = SUPA_SECRET;
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const AuthMiddleware  = require('../middlewares/auth');
const ErrorHandler    = require('../middlewares/errorHandler');
const ApiResponse     = require('../utils/ApiResponse');
const AppError        = require('../utils/AppError');

// ─── AuthMiddleware — ausência de token ──────────────────────────

suite('AuthMiddleware — sem token', () => {

  test('sem header Authorization → 401', async () => {
    const { req, res, next, captured } = criarMocks();
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('"Bearer " com token vazio → 401', async () => {
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: 'Bearer ' },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
  });

  test('header Basic (não-Bearer) → 401', async () => {
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
  });

});

suite('AuthMiddleware — token Supabase válido (verificação local)', () => {

  test('token válido → next() chamado', async () => {
    const token = gerarTokenSupa({ sub: UUID_TEST, email: 'test@barberflow.com' });
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: `Bearer ${token}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('token válido → req.user.id preenchido', async () => {
    const token = gerarTokenSupa({ sub: UUID_TEST });
    const { req, res, next } = criarMocks({
      headers: { authorization: `Bearer ${token}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(req.user?.id, UUID_TEST);
  });

  test('token válido → req.user.email preenchido', async () => {
    const token = gerarTokenSupa({ sub: UUID_TEST, email: 'pro@bff.com' });
    const { req, res, next } = criarMocks({
      headers: { authorization: `Bearer ${token}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(req.user?.email, 'pro@bff.com');
  });

  test('token assinado com secret errado → 401', async () => {
    const jwt   = require('jsonwebtoken');
    const token = jwt.sign({ sub: UUID_TEST }, 'secret-completamente-errado', { algorithm: 'HS256' });
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: `Bearer ${token}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('token expirado → 401', async () => {
    const token = gerarTokenSupa({
      sub: UUID_TEST,
      exp: Math.floor(Date.now() / 1000) - 3600, // expirou há 1h
    });
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: `Bearer ${token}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
  });

  test('token malformado → 401', async () => {
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: 'Bearer nao.eh.um.jwt.valido' },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
  });

});

// ─── ErrorHandler ────────────────────────────────────────────────

suite('ErrorHandler — tratamento de erros', () => {

  test('AppError(400) → status 400 com mensagem', () => {
    const { req, res, captured } = criarMocks();
    ErrorHandler.handle(new AppError('Campo obrigatório.', 400), req, res, () => {});
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(captured.body?.ok, false);
    assert.strictEqual(captured.body?.error, 'Campo obrigatório.');
  });

  test('AppError(404) → status 404', () => {
    const { req, res, captured } = criarMocks();
    ErrorHandler.handle(new AppError('Não encontrado.', 404), req, res, () => {});
    assert.strictEqual(captured.status, 404);
  });

  test('Error genérico → status 500 com ok: false', () => {
    const { req, res, captured } = criarMocks();
    ErrorHandler.handle(new Error('Algo quebrou internamente.'), req, res, () => {});
    assert.strictEqual(captured.status, 500);
    assert.strictEqual(captured.body?.ok, false);
  });

});

// ─── ApiResponse ─────────────────────────────────────────────────

suite('ApiResponse — formatos de resposta', () => {

  test('success() → 200 { ok: true, dados }', () => {
    const { res, captured } = criarMocks();
    ApiResponse.success(res, { id: 1 });
    assert.strictEqual(captured.status, 200);
    assert.deepEqual(captured.body, { ok: true, dados: { id: 1 } });
  });

  test('success() sem dados → 200 { ok: true }', () => {
    const { res, captured } = criarMocks();
    ApiResponse.success(res);
    assert.strictEqual(captured.status, 200);
    assert.strictEqual(captured.body?.ok, true);
    assert.ok(!('dados' in captured.body), 'dados não deve estar presente quando null');
  });

  test('success() com meta → inclui meta no payload', () => {
    const { res, captured } = criarMocks();
    ApiResponse.success(res, [1, 2, 3], { total: 3 });
    assert.deepEqual(captured.body?.meta, { total: 3 });
  });

  test('created() → 201 { ok: true, dados }', () => {
    const { res, captured } = criarMocks();
    ApiResponse.created(res, { id: 2 });
    assert.strictEqual(captured.status, 201);
    assert.deepEqual(captured.body, { ok: true, dados: { id: 2 } });
  });

  test('notFound() → 404 { ok: false, error }', () => {
    const { res, captured } = criarMocks();
    ApiResponse.notFound(res, 'Agendamento não encontrado.');
    assert.strictEqual(captured.status, 404);
    assert.strictEqual(captured.body?.ok, false);
    assert.strictEqual(captured.body?.error, 'Agendamento não encontrado.');
  });

  test('fail() com AppError(422) → 422', () => {
    const { res, captured } = criarMocks();
    ApiResponse.fail(res, new AppError('Dados inválidos.', 422));
    assert.strictEqual(captured.status, 422);
    assert.strictEqual(captured.body?.ok, false);
  });

  test('fail() com Error genérico → 500', () => {
    const { res, captured } = criarMocks();
    ApiResponse.fail(res, new Error('Algo quebrou.'));
    assert.strictEqual(captured.status, 500);
  });

});

// ─── AppError ────────────────────────────────────────────────────

suite('AppError — class e factory methods', () => {

  test('instanceof Error e instanceof AppError', () => {
    const err = new AppError('msg', 400);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof AppError);
  });

  test('status é acessível via getter', () => {
    const err = new AppError('msg', 422);
    assert.strictEqual(err.status, 422);
  });

  test('isOperational padrão = true', () => {
    const err = new AppError('msg', 400);
    assert.strictEqual(err.isOperational, true);
  });

  test('AppError.badRequest() → status 400', () => {
    assert.strictEqual(AppError.badRequest('x').status, 400);
  });

  test('AppError.unauthorized() → status 401', () => {
    assert.strictEqual(AppError.unauthorized().status, 401);
  });

  test('AppError.forbidden() → status 403', () => {
    assert.strictEqual(AppError.forbidden().status, 403);
  });

  test('AppError.notFound() → status 404', () => {
    assert.strictEqual(AppError.notFound().status, 404);
  });

  test('AppError.conflict() → status 409', () => {
    assert.strictEqual(AppError.conflict().status, 409);
  });

  test('AppError.internal() → status 500, isOperational=false', () => {
    const err = AppError.internal();
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.isOperational, false);
  });

  test('AppError.unavailable() → status 503', () => {
    assert.strictEqual(AppError.unavailable().status, 503);
  });

  test('mensagem customizada é preservada', () => {
    const err = AppError.badRequest('ID inválido.');
    assert.strictEqual(err.message, 'ID inválido.');
  });

});
