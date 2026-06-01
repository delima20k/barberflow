'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                        = require('node:assert/strict');
const { ReputationScore }           = require('../../../middlewares/abuse/ReputationScore');

describe('ReputationScore', () => {
  /** @type {ReputationScore} */ let rep;

  beforeEach(() => {
    rep = new ReputationScore({ initial: 50, max: 100, min: 0, decayIntervalMs: 1000, decayAmount: 5 });
  });

  it('retorna score inicial para usuário desconhecido', () => {
    assert.equal(rep.getScore('novo'), 50);
  });

  it('penalize reduz o score', () => {
    rep.penalize('u1', 15);
    assert.equal(rep.getScore('u1'), 35);
  });

  it('reward aumenta o score', () => {
    rep.penalize('u1', 30); // 50 - 30 = 20
    rep.reward('u1', 10);   // 20 + 10 = 30
    assert.equal(rep.getScore('u1'), 30);
  });

  it('score não ultrapassa max=100', () => {
    rep.reward('u2', 100);
    assert.equal(rep.getScore('u2'), 100);
  });

  it('score não cai abaixo de min=0', () => {
    rep.penalize('u3', 200);
    assert.equal(rep.getScore('u3'), 0);
  });

  it('adjust com valor negativo é equivalente a penalize', () => {
    const a = new ReputationScore({ initial: 50 });
    const b = new ReputationScore({ initial: 50 });
    a.penalize('u', 10);
    b.adjust('u', -10);
    assert.equal(a.getScore('u'), b.getScore('u'));
  });

  it('decaimento temporal recupera score ao passar intervals', () => {
    const r = new ReputationScore({
      initial: 50, max: 100, min: 0,
      decayIntervalMs: 1, // 1ms para teste instantâneo
      decayAmount: 10,
    });
    r.penalize('u', 20); // 30
    // Simula passagem de 3 intervalos manipulando internamente via getScore
    // Ajustamos updatedAt manualmente acessando via hack de teste não existe —
    // mas como decayIntervalMs=1ms, qualquer await microtask deve acumular
    // Alternativa: esperar 5ms (3 intervalos de 1ms)
    return new Promise(resolve => {
      setTimeout(() => {
        const s = r.getScore('u'); // deve ter recuperado: 30 + N*10
        assert.ok(s > 30, `score ${s} deveria ser > 30 após decaimento`);
        resolve();
      }, 5);
    });
  });

  it('clear limpa todos os scores', () => {
    rep.penalize('u1', 10);
    rep.penalize('u2', 20);
    rep.clear();
    assert.equal(rep.getScore('u1'), 50); // volta ao initial
  });

  it('stopDecay interrompe o timer interno', () => {
    const r = new ReputationScore({ decayIntervalMs: 10 });
    r.startDecay();
    r.stopDecay();
    // Não deve lançar ao parar duas vezes
    assert.doesNotThrow(() => r.stopDecay());
  });
});
