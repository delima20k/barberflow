'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const SOURCE = join(__dirname, '..', 'apps', 'landing-page', 'js', 'plan-deck.js');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    const enabled = force ?? !this.values.has(name);
    enabled ? this.values.add(name) : this.values.delete(name);
    return enabled;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    const normalized = {
      currentTarget: this,
      target: this,
      preventDefault() {},
      ...event,
    };
    this.listeners.get(type)?.forEach((listener) => listener(normalized));
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

class PlanDeckFixture {
  constructor() {
    this.root = new FakeElement();
    this.cards = [new FakeElement(), new FakeElement()];
    this.root.querySelectorAll = (selector) => selector === '[data-plan-card]' ? this.cards : [];
  }

  load() {
    const context = vm.createContext({ globalThis: null, matchMedia: () => ({ matches: false }) });
    context.globalThis = context;
    vm.runInContext(readFileSync(SOURCE, 'utf8'), context);
    return context.PlanDeck;
  }
}

describe('PlanDeck', () => {
  it('deve destacar um plano por vez e trocar a pilha ao clicar no card de tras', () => {
    const fixture = new PlanDeckFixture();
    const PlanDeck = fixture.load();
    const deck = new PlanDeck(fixture.root).init();

    assert.equal(fixture.cards[0].getAttribute('aria-pressed'), 'true');
    assert.equal(fixture.cards[1].getAttribute('aria-pressed'), 'false');
    assert.equal(fixture.cards[0].classList.contains('is-front'), true);

    fixture.cards[1].dispatch('click');
    assert.equal(deck.frontIndex, 1);
    assert.equal(fixture.cards[1].classList.contains('is-front'), true);
    assert.equal(fixture.cards[0].classList.contains('is-back'), true);
    assert.equal(fixture.root.classList.contains('is-switching'), true);

    fixture.root.dispatch('animationend', { target: fixture.cards[1] });
    assert.equal(fixture.root.classList.contains('is-switching'), false);
  });

  it('deve aceitar teclado e remover listeners ao destruir', () => {
    const fixture = new PlanDeckFixture();
    const PlanDeck = fixture.load();
    const deck = new PlanDeck(fixture.root).init();
    let prevented = false;

    fixture.cards[1].dispatch('keydown', {
      key: ' ',
      preventDefault() { prevented = true; },
    });

    assert.equal(prevented, true);
    assert.equal(deck.frontIndex, 1);

    deck.destroy();
    assert.equal(fixture.root.listenerCount(), 0);
    assert.equal(fixture.cards[0].listenerCount(), 0);
    assert.equal(fixture.cards[1].listenerCount(), 0);
  });
});
