'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CronExpression } = require('../../../../domain/scheduler/value-objects/CronExpression');

describe('CronExpression', () => {
  it('deve rejeitar expressao invalida', () => {
    const result = CronExpression.create('61 * * * *', { timezone: 'UTC' });
    assert.equal(result.isFail(), true);
  });

  it('deve calcular proxima execucao em UTC', () => {
    const cron = CronExpression.create('*/15 * * * *', { timezone: 'UTC' }).getValue();
    const next = cron.nextAfter(new Date('2026-05-22T10:07:12.000Z'));
    assert.equal(next.toISOString(), '2026-05-22T10:15:00.000Z');
  });

  it('deve respeitar timezone America/Sao_Paulo', () => {
    const cron = CronExpression.create('0 9 * * *', { timezone: 'America/Sao_Paulo' }).getValue();
    const next = cron.nextAfter(new Date('2026-05-22T10:00:00.000Z'));
    assert.equal(next.toISOString(), '2026-05-22T12:00:00.000Z');
  });

  it('deve suportar listas, ranges e dia da semana', () => {
    const cron = CronExpression.create('30 8-10 * * 1,5', { timezone: 'UTC' }).getValue();
    assert.equal(cron.matches(new Date('2026-05-22T08:30:00.000Z')), true);
  });
});
