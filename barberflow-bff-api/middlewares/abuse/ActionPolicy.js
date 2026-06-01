'use strict';

/** @readonly @enum {string} */
const Action = Object.freeze({
  ALLOW:      'allow',
  CHALLENGE:  'challenge',
  THROTTLE:   'throttle',
  SOFT_BLOCK: 'soft_block',
  HARD_BLOCK: 'hard_block',
});

/**
 * ActionDecision — resultado da política com ação e metadados.
 */
class ActionDecision {
  /**
   * @param {string} action       — da enum Action
   * @param {string} reason       — raciocínio legível por máquina
   * @param {number} [retryAfterMs=0] — tempo de espera sugerido
   */
  constructor(action, reason, retryAfterMs = 0) {
    this.action       = action;
    this.reason       = reason;
    this.retryAfterMs = retryAfterMs;
  }

  get isAllowed()          { return this.action === Action.ALLOW; }
  get requiresChallenge()  { return this.action === Action.CHALLENGE; }
  get isThrottled()        { return this.action === Action.THROTTLE; }
  get isBlocked()          { return this.action === Action.HARD_BLOCK || this.action === Action.SOFT_BLOCK; }
}

/**
 * ActionPolicy — decide a ação com base em reputação, sinal de abuso e lista dinâmica.
 *
 * Zonas de reputação:
 *   >= 70 → estabelecido  — thresholds lenientes
 *   40-69 → comum         — thresholds padrão
 *   10-39 → suspeito      — thresholds rígidos
 *   <  10 → bloqueio imediato
 *
 * Matriz de decisão por risco (AbuseSignal.riskScore):
 *   Estabelecido : allow <40 | throttle 40-69 | challenge 70-89 | soft_block 90+
 *   Comum        : allow <20 | throttle 20-39 | challenge 40-59 | soft_block 60-79 | hard_block 80+
 *   Suspeito     : throttle <20 | challenge 20-39 | soft_block 40-59 | hard_block 60+
 */
class ActionPolicy {
  /**
   * @param {number}  reputationScore — 0-100
   * @param {import('./AbuseDetector').AbuseSignal} signal
   * @param {{ action: string }|null} [dynamicEntry] — entrada da DynamicList
   * @returns {ActionDecision}
   */
  static decide(reputationScore, signal, dynamicEntry = null) {
    // 1. Lista dinâmica tem prioridade máxima
    if (dynamicEntry) {
      return new ActionDecision(dynamicEntry.action, 'dynamic_list');
    }

    // 2. Reputação muito baixa → hard_block imediato
    if (reputationScore < 10) {
      return new ActionDecision(Action.HARD_BLOCK, 'reputation_very_low', 24 * 60 * 60_000);
    }

    const isEstablished = reputationScore >= 70;
    const isSuspect     = reputationScore < 40;
    const risk          = signal.riskScore;

    // 3. Sem abuso e risco baixo → allow
    if (!signal.isAbusive && risk < 20) {
      return new ActionDecision(Action.ALLOW, 'clean');
    }

    if (isEstablished) {
      if (risk < 40)  return new ActionDecision(Action.ALLOW,      'established_low_risk');
      if (risk < 70)  return new ActionDecision(Action.THROTTLE,   'established_mid_risk',     10_000);
      if (risk < 90)  return new ActionDecision(Action.CHALLENGE,  'established_high_risk');
      return             new ActionDecision(Action.SOFT_BLOCK, 'established_extreme_risk', 30 * 60_000);
    }

    if (isSuspect) {
      if (risk < 20)  return new ActionDecision(Action.THROTTLE,   'suspect_low_risk',    30_000);
      if (risk < 40)  return new ActionDecision(Action.CHALLENGE,  'suspect_mid_risk');
      if (risk < 60)  return new ActionDecision(Action.SOFT_BLOCK, 'suspect_high_risk',   15 * 60_000);
      return             new ActionDecision(Action.HARD_BLOCK, 'suspect_extreme_risk', 60 * 60_000);
    }

    // Usuário comum (40-69)
    if (risk < 20)  return new ActionDecision(Action.ALLOW,      'normal_low_risk');
    if (risk < 40)  return new ActionDecision(Action.THROTTLE,   'normal_mid_risk',         15_000);
    if (risk < 60)  return new ActionDecision(Action.CHALLENGE,  'normal_high_risk');
    if (risk < 80)  return new ActionDecision(Action.SOFT_BLOCK, 'normal_very_high_risk', 10 * 60_000);
    return             new ActionDecision(Action.HARD_BLOCK, 'normal_extreme_risk',    60 * 60_000);
  }
}

module.exports = { ActionPolicy, ActionDecision, Action };
