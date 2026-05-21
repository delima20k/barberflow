'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { FilaStatus }   = require('../../../domain/fila/FilaStatus');

describe('FilaStatus', () => {
  describe('create', () => {
    it('cria status válido', () => {
      const r = FilaStatus.create('waiting');
      assert.equal(r.isOk(), true);
      assert.equal(r.getValue().value, 'waiting');
    });

    it('falha para status inválido', () => {
      const r = FilaStatus.create('unknown');
      assert.equal(r.isFail(), true);
      assert.ok(r.getError().includes('FilaStatus inválido'));
    });
  });

  describe('initial', () => {
    it('retorna waiting', () => {
      const s = FilaStatus.initial();
      assert.equal(s.value, 'waiting');
      assert.equal(s.isWaiting(), true);
    });
  });

  describe('transicionarPara', () => {
    it('waiting → called é válido', () => {
      const s = FilaStatus.initial();
      const r = s.transicionarPara('called');
      assert.equal(r.isOk(), true);
      assert.equal(r.getValue().value, 'called');
    });

    it('waiting → done é inválido', () => {
      const r = FilaStatus.initial().transicionarPara('done');
      assert.equal(r.isFail(), true);
    });

    it('status terminal não permite transições', () => {
      const done = FilaStatus.create('done').getValue();
      assert.equal(done.transicionarPara('waiting').isFail(), true);
    });
  });

  describe('isTerminal', () => {
    it('done, absent e cancelled são terminais', () => {
      assert.equal(FilaStatus.create('done').getValue().isTerminal(), true);
      assert.equal(FilaStatus.create('absent').getValue().isTerminal(), true);
      assert.equal(FilaStatus.create('cancelled').getValue().isTerminal(), true);
    });

    it('waiting e called não são terminais', () => {
      assert.equal(FilaStatus.initial().isTerminal(), false);
      assert.equal(FilaStatus.create('called').getValue().isTerminal(), false);
    });
  });
});
