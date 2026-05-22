'use strict';

const { Result } = require('../../shared/Result');

class CronExpression {
  #expr;
  #timezone;
  #sets;

  constructor(expr, timezone, sets) {
    this.#expr = expr;
    this.#timezone = timezone;
    this.#sets = sets;
    Object.freeze(this);
  }

  static create(expr, { timezone = 'UTC' } = {}) {
    if (typeof expr !== 'string') return Result.fail('CronExpression.expr deve ser string');
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return Result.fail('CronExpression requer 5 campos');
    try {
      CronExpression.#assertTimezone(timezone);
      const sets = {
        minute: CronExpression.#parseField(parts[0], 0, 59),
        hour: CronExpression.#parseField(parts[1], 0, 23),
        dayOfMonth: CronExpression.#parseField(parts[2], 1, 31),
        month: CronExpression.#parseField(parts[3], 1, 12),
        dayOfWeek: CronExpression.#parseField(parts[4], 0, 7),
      };
      if (sets.dayOfWeek.has(7)) {
        sets.dayOfWeek.add(0);
        sets.dayOfWeek.delete(7);
      }
      return Result.ok(new CronExpression(expr.trim(), timezone, sets));
    } catch (err) {
      return Result.fail(err.message);
    }
  }

  get expression() { return this.#expr; }
  get timezone() { return this.#timezone; }

  matches(date) {
    const p = this.#parts(date);
    return this.#sets.minute.has(p.minute)
      && this.#sets.hour.has(p.hour)
      && this.#sets.dayOfMonth.has(p.day)
      && this.#sets.month.has(p.month)
      && this.#sets.dayOfWeek.has(p.weekday);
  }

  nextAfter(date) {
    const start = new Date(date.getTime());
    start.setUTCSeconds(0, 0);
    start.setUTCMinutes(start.getUTCMinutes() + 1);
    const maxMinutes = 366 * 24 * 60;
    for (let i = 0; i < maxMinutes; i++) {
      const candidate = new Date(start.getTime() + (i * 60_000));
      if (this.matches(candidate)) return candidate;
    }
    throw new Error('CronExpression: proxima execucao nao encontrada em 366 dias');
  }

  toJSON() {
    return { expression: this.expression, timezone: this.timezone };
  }

  #parts(date) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: this.#timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const values = {};
    for (const part of fmt.formatToParts(date)) values[part.type] = part.value;
    return {
      minute: Number(values.minute),
      hour: Number(values.hour) % 24,
      day: Number(values.day),
      month: Number(values.month),
      weekday: CronExpression.#weekday(values.weekday),
    };
  }

  static #weekday(value) {
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[value];
  }

  static #assertTimezone(timezone) {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  }

  static #parseField(field, min, max) {
    const out = new Set();
    for (const token of field.split(',')) {
      CronExpression.#parseToken(token.trim(), min, max).forEach(v => out.add(v));
    }
    if (out.size === 0) throw new Error(`campo cron vazio: ${field}`);
    return out;
  }

  static #parseToken(token, min, max) {
    const [rangePart, stepPart] = token.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`step cron invalido: ${token}`);
    let start;
    let end;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number);
      start = a;
      end = b;
    } else {
      start = Number(rangePart);
      end = start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new Error(`range cron invalido: ${token}`);
    }
    const values = [];
    for (let value = start; value <= end; value += step) values.push(value);
    return values;
  }
}

module.exports = { CronExpression };
