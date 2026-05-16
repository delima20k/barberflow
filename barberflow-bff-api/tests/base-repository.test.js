'use strict';

// =============================================================
// base-repository.test.js — Testes unitários de BaseRepository.
//
// Cobre:
//   - _throwDbError: lança AppError(500) com mensagem correta
//   - _throwDbError: loga o erro original do Supabase via logger.error
//   - _throwDbError: inclui nome do repositório e contexto na mensagem
// =============================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

process.env.APP_ENV = 'development';

const BaseRepository = require('../repositories/BaseRepository');
const AppError       = require('../utils/AppError');
const { logger }     = require('../middlewares/logger');

// ── Subclasse concreta para acessar métodos protegidos ───────────
class TestRepository extends BaseRepository {
  constructor() {
    super('TestRepository', null);
  }

  exposeThrowDbError(error, ctx) {
    this._throwDbError(error, ctx);
  }
}

// ─── Suite: _throwDbError ────────────────────────────────────────

suite('BaseRepository — _throwDbError', () => {

  test('lança AppError com status 500', () => {
    const repo = new TestRepository();
    assert.throws(
      () => repo.exposeThrowDbError({ message: 'db error', code: 'PGRST116' }, 'getById'),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 500);
        return true;
      },
    );
  });

  test('loga o erro real do Supabase via logger.error (não console.error)', () => {
    const repo   = new TestRepository();
    const logado = [];
    const orig   = logger.error.bind(logger);
    logger.error = (obj, msg) => logado.push([obj, msg]);

    try {
      repo.exposeThrowDbError({ message: 'supabase error', code: 'P0001' }, 'getNearby');
    } catch {
      // esperado — testamos apenas o log
    } finally {
      logger.error = orig;
    }

    assert.strictEqual(logado.length, 1, 'logger.error deve ter sido chamado uma vez');
    assert.strictEqual(logado[0][1], '[BFF] erro de banco', 'mensagem deve ser [BFF] erro de banco');
    assert.strictEqual(
      logado[0][0]?.err?.message,
      'supabase error',
      'erro original do Supabase deve estar no log',
    );
    assert.strictEqual(logado[0][0]?.op, 'getNearby', 'operação deve estar no log');
  });

  test('mensagem do AppError inclui nome do repositório e contexto', () => {
    const repo = new TestRepository();
    let thrown;
    try {
      repo.exposeThrowDbError({}, 'findAll');
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown.message.includes('TestRepository'), 'deve incluir nome do repositório');
    assert.ok(thrown.message.includes('findAll'),        'deve incluir operação no contexto');
  });

  test('sem contexto: mensagem inclui só nome do repositório', () => {
    const repo = new TestRepository();
    let thrown;
    try {
      repo.exposeThrowDbError({});
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown.message.includes('TestRepository'));
  });

  test('isOperational é false (erro interno não operacional)', () => {
    const repo = new TestRepository();
    let thrown;
    try {
      repo.exposeThrowDbError({ message: 'db error' }, 'upsert');
    } catch (err) {
      thrown = err;
    }
    assert.strictEqual(thrown.isOperational, false);
  });
});
