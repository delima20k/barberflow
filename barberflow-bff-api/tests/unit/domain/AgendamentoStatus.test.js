'use strict';

const { describe, it }       = require('node:test');
const assert                 = require('node:assert/strict');
const { AgendamentoStatus }  = require('../../../domain/agendamento/AgendamentoStatus');

describe('AgendamentoStatus', () => {
  describe('create', () => {
    it('cria status válido', () => {
      const r = AgendamentoStatus.create('pending');
      assert.equal(r.isOk(), true);
      assert.equal(r.getValue().value, 'pending');
    });

    it('retorna fail para status inválido', () => {
      const r = AgendamentoStatus.create('xyz');
      assert.equal(r.isFail(), true);
      assert.ok(r.getError().includes('AgendamentoStatus inválido'));
    });
  });

  describe('initial', () => {
    it('retorna status pending', () => {
      const s = AgendamentoStatus.initial();
      assert.equal(s.value, 'pending');
      assert.equal(s.isPending(), true);
    });
  });

  describe('transicionarPara', () => {
    it('transição válida retorna ok', () => {
      const s = AgendamentoStatus.initial();
      const r = s.transicionarPara('confirmed');
      assert.equal(r.isOk(), true);
      assert.equal(r.getValue().value, 'confirmed');
    });

    it('transição inválida retorna fail', () => {
      const s = AgendamentoStatus.initial();
      const r = s.transicionarPara('done');
      assert.equal(r.isFail(), true);
      assert.ok(r.getError().includes('Transição inválida'));
    });

    it('não permite sair de status terminal', () => {
      const done = AgendamentoStatus.create('done').getValue();
      const r = done.transicionarPara('pending');
      assert.equal(r.isFail(), true);
    });
  });

  describe('helpers de estado', () => {
    it('isTerminal() verdadeiro para done/cancelled/no_show', () => {
      assert.equal(AgendamentoStatus.create('done').getValue().isTerminal(), true);
      assert.equal(AgendamentoStatus.create('cancelled').getValue().isTerminal(), true);
      assert.equal(AgendamentoStatus.create('no_show').getValue().isTerminal(), true);
    });

    it('isTerminal() falso para não-terminais', () => {
      assert.equal(AgendamentoStatus.initial().isTerminal(), false);
      assert.equal(AgendamentoStatus.create('confirmed').getValue().isTerminal(), false);
    });

    it('isDone() e isCancelled()', () => {
      assert.equal(AgendamentoStatus.create('done').getValue().isDone(), true);
      assert.equal(AgendamentoStatus.create('cancelled').getValue().isCancelled(), true);
    });
  });

  describe('equals (herança de BaseValueObject)', () => {
    it('dois statuses iguais são equals', () => {
      const a = AgendamentoStatus.create('confirmed').getValue();
      const b = AgendamentoStatus.create('confirmed').getValue();
      assert.equal(a.equals(b), true);
    });

    it('statuses diferentes não são equals', () => {
      const a = AgendamentoStatus.create('pending').getValue();
      const b = AgendamentoStatus.create('confirmed').getValue();
      assert.equal(a.equals(b), false);
    });
  });
});
