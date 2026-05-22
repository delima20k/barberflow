'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { ActionPolicy, Action } = require('../../../middlewares/abuse/ActionPolicy');
const { AbuseSignal }          = require('../../../middlewares/abuse/AbuseDetector');

/** Helper: cria AbuseSignal com riskScore e regras disparadas. */
function signal(riskScore, rules = []) {
  return new AbuseSignal(rules.length > 0 ? rules : (riskScore > 0 ? ['bot_signature'] : []), riskScore);
}

describe('ActionPolicy — usuário comum (reputação 55)', () => {
  const rep = 55;

  it('allow para risco < 20', () => {
    const d = ActionPolicy.decide(rep, signal(0, []));
    assert.equal(d.action, Action.ALLOW);
    assert.ok(d.isAllowed);
  });

  it('throttle para risco 20-39', () => {
    const d = ActionPolicy.decide(rep, signal(30));
    assert.equal(d.action, Action.THROTTLE);
    assert.ok(d.isThrottled);
  });

  it('challenge para risco 40-59', () => {
    const d = ActionPolicy.decide(rep, signal(50));
    assert.equal(d.action, Action.CHALLENGE);
    assert.ok(d.requiresChallenge);
  });

  it('soft_block para risco 60-79', () => {
    const d = ActionPolicy.decide(rep, signal(70));
    assert.equal(d.action, Action.SOFT_BLOCK);
    assert.ok(d.isBlocked);
  });

  it('hard_block para risco >= 80', () => {
    const d = ActionPolicy.decide(rep, signal(80));
    assert.equal(d.action, Action.HARD_BLOCK);
    assert.ok(d.isBlocked);
  });
});

describe('ActionPolicy — usuário estabelecido (reputação 80)', () => {
  const rep = 80;

  it('allow para risco < 40', () => {
    const d = ActionPolicy.decide(rep, signal(35));
    assert.equal(d.action, Action.ALLOW);
  });

  it('throttle para risco 40-69', () => {
    const d = ActionPolicy.decide(rep, signal(60));
    assert.equal(d.action, Action.THROTTLE);
  });

  it('challenge para risco 70-89', () => {
    const d = ActionPolicy.decide(rep, signal(75));
    assert.equal(d.action, Action.CHALLENGE);
  });

  it('soft_block para risco >= 90', () => {
    const d = ActionPolicy.decide(rep, signal(95));
    assert.equal(d.action, Action.SOFT_BLOCK);
    // Nunca hard_block para estabelecido com risk < extreme
    assert.notEqual(d.action, Action.HARD_BLOCK);
  });
});

describe('ActionPolicy — usuário suspeito (reputação 25)', () => {
  const rep = 25;

  it('throttle imediato para risco baixo', () => {
    const d = ActionPolicy.decide(rep, signal(15));
    assert.equal(d.action, Action.THROTTLE);
  });

  it('hard_block para risco >= 60', () => {
    const d = ActionPolicy.decide(rep, signal(65));
    assert.equal(d.action, Action.HARD_BLOCK);
    assert.ok(d.retryAfterMs > 0);
  });
});

describe('ActionPolicy — reputação muito baixa (< 10)', () => {
  it('hard_block imediato independente do risco', () => {
    const d = ActionPolicy.decide(5, signal(0, []));
    assert.equal(d.action, Action.HARD_BLOCK);
    assert.equal(d.reason, 'reputation_very_low');
  });
});

describe('ActionPolicy — lista dinâmica sobrescreve tudo', () => {
  it('allow da lista dinâmica é respeitado mesmo com risco 100', () => {
    const d = ActionPolicy.decide(0, signal(100), { action: Action.ALLOW });
    assert.equal(d.action, Action.ALLOW);
    assert.equal(d.reason, 'dynamic_list');
  });

  it('hard_block da lista dinâmica é respeitado mesmo com reputação 100', () => {
    const d = ActionPolicy.decide(100, signal(0, []), { action: Action.HARD_BLOCK });
    assert.equal(d.action, Action.HARD_BLOCK);
  });
});

describe('ActionPolicy — ActionDecision helpers', () => {
  it('isAllowed, isBlocked, isThrottled, requiresChallenge exclusivos', () => {
    const dA = ActionPolicy.decide(55, signal(0, []));
    assert.ok(dA.isAllowed);
    assert.equal(dA.isBlocked, false);

    const dB = ActionPolicy.decide(55, signal(30));
    assert.ok(dB.isThrottled);

    const dC = ActionPolicy.decide(55, signal(50));
    assert.ok(dC.requiresChallenge);

    const dD = ActionPolicy.decide(55, signal(90));
    assert.ok(dD.isBlocked);
  });
});
