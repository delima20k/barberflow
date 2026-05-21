'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { Result }       = require('../../../domain/shared/Result');

describe('Result', () => {
  describe('Result.ok', () => {
    it('cria resultado de sucesso com valor', () => {
      const r = Result.ok(42);
      assert.equal(r.isOk(), true);
      assert.equal(r.isFail(), false);
      assert.equal(r.getValue(), 42);
    });

    it('cria resultado de sucesso sem valor (null)', () => {
      const r = Result.ok();
      assert.equal(r.isOk(), true);
      assert.equal(r.getValue(), null);
    });

    it('lança ao chamar getError em resultado ok', () => {
      const r = Result.ok(1);
      assert.throws(() => r.getError(), /Result.getError/);
    });
  });

  describe('Result.fail', () => {
    it('cria resultado de falha com mensagem', () => {
      const r = Result.fail('erro aqui');
      assert.equal(r.isFail(), true);
      assert.equal(r.isOk(), false);
      assert.equal(r.getError(), 'erro aqui');
    });

    it('lança ao chamar getValue em resultado fail', () => {
      const r = Result.fail('oops');
      assert.throws(() => r.getValue(), /Result.getValue/);
    });
  });

  describe('Result.combine', () => {
    it('retorna ok quando todos ok', () => {
      const r = Result.combine([Result.ok(1), Result.ok(2), Result.ok(3)]);
      assert.equal(r.isOk(), true);
      assert.deepEqual(r.getValue(), [1, 2, 3]);
    });

    it('retorna o primeiro fail quando há falha', () => {
      const r = Result.combine([Result.ok(1), Result.fail('falhou'), Result.ok(3)]);
      assert.equal(r.isFail(), true);
      assert.equal(r.getError(), 'falhou');
    });
  });

  describe('getOrElse', () => {
    it('retorna o valor se ok', () => {
      assert.equal(Result.ok('oi').getOrElse('padrão'), 'oi');
    });

    it('retorna o padrão se fail', () => {
      assert.equal(Result.fail('x').getOrElse('padrão'), 'padrão');
    });
  });

  describe('map', () => {
    it('transforma o valor se ok', () => {
      const r = Result.ok(2).map(x => x * 3);
      assert.equal(r.getValue(), 6);
    });

    it('não executa fn se fail', () => {
      let called = false;
      const r = Result.fail('err').map(() => { called = true; return 99; });
      assert.equal(called, false);
      assert.equal(r.isFail(), true);
    });
  });

  describe('flatMap', () => {
    it('encadeia results', () => {
      const r = Result.ok(5).flatMap(x => Result.ok(x + 1));
      assert.equal(r.getValue(), 6);
    });

    it('propaga falha sem executar fn', () => {
      let called = false;
      const r = Result.fail('err').flatMap(() => { called = true; return Result.ok(1); });
      assert.equal(called, false);
      assert.equal(r.isFail(), true);
    });
  });

  describe('match', () => {
    it('chama ok() quando sucesso', () => {
      const out = Result.ok(7).match({ ok: v => v * 2, fail: () => -1 });
      assert.equal(out, 14);
    });

    it('chama fail() quando falha', () => {
      const out = Result.fail('boom').match({ ok: () => 'ok', fail: e => `error: ${e}` });
      assert.equal(out, 'error: boom');
    });
  });

  describe('imutabilidade', () => {
    it('é frozen', () => {
      const r = Result.ok('x');
      assert.equal(Object.isFrozen(r), true);
    });
  });
});
