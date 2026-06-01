'use strict';

/**
 * Money representa valores monetarios em centavos para evitar erros de ponto flutuante.
 */
class Money {
  #cents;

  constructor(cents = 0) {
    this.#cents = Number.isFinite(cents) ? Math.round(cents) : 0;
  }

  static zero() {
    return new Money(0);
  }

  static from(value) {
    if (value instanceof Money) return value;
    if (value === null || value === undefined || value === '') return Money.zero();

    const normalized = typeof value === 'string'
      ? (value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value)
      : value;
    const numberValue = Number(normalized);

    if (!Number.isFinite(numberValue)) return Money.zero();
    return new Money(Math.round(numberValue * 100));
  }

  static fromCents(cents) {
    return new Money(cents);
  }

  get cents() {
    return this.#cents;
  }

  plus(other) {
    return new Money(this.#cents + Money.from(other).cents);
  }

  minus(other) {
    return new Money(this.#cents - Money.from(other).cents);
  }

  maxZero() {
    return new Money(Math.max(0, this.#cents));
  }

  timesPercent(percent) {
    const safePercent = Number.isFinite(Number(percent)) ? Number(percent) : 0;
    return new Money(Math.round((this.#cents * safePercent) / 100));
  }

  toNumber() {
    return Number((this.#cents / 100).toFixed(2));
  }
}

module.exports = Money;
