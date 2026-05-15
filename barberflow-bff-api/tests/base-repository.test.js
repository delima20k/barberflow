'use strict';

// =============================================================
// base-repository.test.js — Testes unitários de BaseRepository.
//
// Cobre:
//   - _throwDbError: lança AppError(500) com mensagem correta
//   - _throwDbError: loga o erro original do Supabase via console.error
//   - _throwDbError: inclui nome do repositório e contexto na mensagem
// =============================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

process.env.APP_ENV = 'development';

const BaseRepository = require('../repositories/BaseRepository');
const AppError       = require('../utils/AppError');

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

  test('loga o erro real do Supabase via console.error', () => {
    const repo   = new TestRepository();
    const logado = [];
    const orig   = console.error;
    console.error = (...args) => logado.push(args);

    try {
      repo.exposeThrowDbError({ message: 'supabase error', code: 'P0001' }, 'getNearby');
    } catch {
      // esperado — testamos apenas o log
    } finally {
      console.error = orig;
    }

    assert.strictEqual(logado.length, 1, 'console.error deve ter sido chamado uma vez');
    assert.strictEqual(logado[0][0], '[BFF DB ERROR]', 'primeiro argumento deve ser [BFF DB ERROR]');
    assert.strictEqual(
      logado[0][1]?.error?.message,
      'supabase error',
      'erro original do Supabase deve estar no log',
    );
    assert.strictEqual(logado[0][1]?.op, 'getNearby', 'operação deve estar no log');
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
