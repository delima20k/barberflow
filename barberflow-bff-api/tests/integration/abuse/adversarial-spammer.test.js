'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                        = require('node:assert/strict');
const { AbuseDetector }             = require('../../../middlewares/abuse/AbuseDetector');
const { ReputationScore }           = require('../../../middlewares/abuse/ReputationScore');
const { ActionPolicy, Action }      = require('../../../middlewares/abuse/ActionPolicy');
const { AbuseEventLog }             = require('../../../middlewares/abuse/AbuseEventLog');

// ─────────────────────────────────────────────────────────────────────────────
// Teste adversarial: simula um spammer real e verifica bloqueio em ≤ N ações.
//
// Perfil do spammer:
//   - User-Agent: python-requests (bot conhecido)
//   - Conta nova (30 min)
//   - Envia sempre o mesmo conteúdo repetido
//   - Alta frequência de requisições
//
// Expectativa:
//   - Deve ser bloqueado (soft ou hard block) em ≤ 5 tentativas
// ─────────────────────────────────────────────────────────────────────────────
describe('Adversarial: spammer real é bloqueado rapidamente', () => {
  const LIMITE_DE_TOLERANCIA = 5; // deve bloquear em ≤ 5 ações

  /** @type {ReputationScore} */ let reputation;

  beforeEach(() => {
    reputation = new ReputationScore({ initial: 50, max: 100, min: 0 });
    AbuseEventLog.clear();
  });

  it(`spammer é bloqueado em ≤ ${LIMITE_DE_TOLERANCIA} ações`, async () => {
    const spammerId   = 'spammer-adversarial-001';
    const SPAM_TEXTO  = 'compre seguidores instagram barato clique aqui';
    const REGRAS      = ['new_account', 'content_similarity', 'bot_signature'];

    let bloqueadoNa = null;
    const historico = [];

    for (let i = 0; i < 20; i++) {
      const signal = await AbuseDetector.evaluate({
        userId:            spammerId,
        userAgent:         'python-requests/2.28.2', // bot UA
        accountAgeMs:      30 * 60_000,              // 30 min — conta nova
        requestCount:      i + 1,
        contentHistory:    [...historico],
        currentContent:    SPAM_TEXTO,
        requestTimestamps: [],
        lastLocations:     [],
      }, REGRAS);

      historico.push(SPAM_TEXTO);

      // Penaliza reputação a cada sinal de abuso
      if (signal.isAbusive) {
        reputation.penalize(spammerId, signal.riskScore / 10);
      }

      const rep      = reputation.getScore(spammerId);
      const decision = ActionPolicy.decide(rep, signal);

      if (decision.isBlocked && bloqueadoNa === null) {
        bloqueadoNa = i + 1; // 1-indexed

        AbuseEventLog.record({
          userId:         spammerId,
          ip:             '1.2.3.4',
          endpoint:       '/api/v1/chat',
          action:         decision.action,
          reason:         decision.reason,
          triggeredRules: signal.triggeredRules,
          riskScore:      signal.riskScore,
        });
        break;
      }
    }

    assert.ok(
      bloqueadoNa !== null,
      'spammer deve ser bloqueado antes de esgotar as 20 tentativas',
    );
    assert.ok(
      bloqueadoNa <= LIMITE_DE_TOLERANCIA,
      `spammer bloqueado na ação ${bloqueadoNa}, mas esperado em ≤ ${LIMITE_DE_TOLERANCIA}`,
    );

    // Aguarda a microtask do AbuseEventLog.record() resolver
    await Promise.resolve();

    // Verifica que o evento foi auditado
    const eventos = AbuseEventLog.snapshot();
    assert.ok(eventos.length > 0, 'deve haver pelo menos 1 evento auditado');
    assert.equal(eventos[0].userId, spammerId);
    assert.ok(
      [Action.SOFT_BLOCK, Action.HARD_BLOCK].includes(eventos[0].action),
      `ação auditada deve ser soft ou hard block, foi: ${eventos[0].action}`,
    );
  });

  it('usuário legítimo não é bloqueado em atividade normal', async () => {
    const userId = 'usuario-legitimo-001';

    for (let i = 0; i < 10; i++) {
      const signal = await AbuseDetector.evaluate({
        userId,
        userAgent:         'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        accountAgeMs:      30 * 24 * 60 * 60_000, // 30 dias — estabelecido
        requestCount:      i + 1,
        contentHistory:    [`mensagem ${i}`, `mensagem ${i - 1}`, `oi tudo bem`],
        currentContent:    `oi, quero agendar para amanhã às ${i}h`,
        requestTimestamps: [],
        lastLocations:     [],
      }, ['new_account', 'content_similarity', 'bot_signature']);

      const rep      = reputation.getScore(userId);
      const decision = ActionPolicy.decide(rep, signal);

      assert.notEqual(
        decision.action, Action.HARD_BLOCK,
        `usuário legítimo não deve ser hard_blocked na ação ${i + 1}`,
      );
      assert.notEqual(
        decision.action, Action.SOFT_BLOCK,
        `usuário legítimo não deve ser soft_blocked na ação ${i + 1}`,
      );
    }
  });

  it('IP compartilhado (NAT) não causa falso positivo global', async () => {
    // Simula 5 usuários diferentes atrás do mesmo IP sem histórico de abuso
    const usuarios = ['nat-u1', 'nat-u2', 'nat-u3', 'nat-u4', 'nat-u5'];

    for (const uid of usuarios) {
      const signal = await AbuseDetector.evaluate({
        userId:            uid,
        userAgent:         'Mozilla/5.0 (Android 13; Mobile)',
        accountAgeMs:      7 * 24 * 60 * 60_000, // 7 dias
        requestCount:      3,
        contentHistory:    [],
        currentContent:    'quero ver os serviços disponíveis',
        requestTimestamps: [],
        lastLocations:     [],
      }, ['new_account', 'content_similarity', 'bot_signature']);

      const rep      = reputation.getScore(uid);
      const decision = ActionPolicy.decide(rep, signal);

      assert.ok(
        decision.isAllowed || decision.isThrottled,
        `${uid} não deve ser bloqueado só por compartilhar IP`,
      );
    }
  });
});
