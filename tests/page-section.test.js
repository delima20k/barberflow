'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const vm               = require('node:vm');
const { carregar }     = require('./_helpers.js');

class EventTargetStub {
  #listeners = new Map();

  addEventListener(eventName, handler) {
    const listeners = this.#listeners.get(eventName) ?? new Set();
    listeners.add(handler);
    this.#listeners.set(eventName, listeners);
  }

  removeEventListener(eventName, handler) {
    this.#listeners.get(eventName)?.delete(handler);
  }

  emit(eventName) {
    this.#listeners.get(eventName)?.forEach(handler => handler());
  }

  listenerCount() {
    return [...this.#listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

class TimerHarness {
  #timers = new Map();
  #nextId = 1;

  setInterval(handler) {
    const id = this.#nextId++;
    this.#timers.set(id, handler);
    return id;
  }

  clearInterval(id) {
    this.#timers.delete(id);
  }

  get activeCount() {
    return this.#timers.size;
  }
}

class ObserverStub {
  static active = 0;

  observe() {
    ObserverStub.active += 1;
  }

  disconnect() {
    ObserverStub.active -= 1;
  }
}

function criarSandbox(timerHarness = new TimerHarness()) {
  const sandbox = vm.createContext({
    console,
    Map,
    Set,
    Object,
    Error,
    MutationObserver: ObserverStub,
    clearInterval: id => timerHarness.clearInterval(id),
    setInterval: handler => timerHarness.setInterval(handler),
  });
  carregar(sandbox, 'events/catalog.js');
  carregar(sandbox, 'shared/js/SectionEventBus.js');
  carregar(sandbox, 'shared/js/PageSection.js');
  return { sandbox, timerHarness };
}

describe('PageSection', () => {
  it('deve executar init, render, update e destroy com estado isolado', () => {
    const { sandbox } = criarSandbox();
    const root = new EventTargetStub();
    const bus = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const renders = [];
    const section = new sandbox.PageSection(root, { eventBus: bus, initialState: { count: 1 } });

    section.render = state => renders.push(state.count);
    section.init();
    section.update({ count: 2 });
    section.update({ count: 2 });
    section.destroy();

    assert.deepEqual(renders, [1, 2, 2]);
    assert.equal(section.state.count, 2);
    assert.equal(section.initialized, false);
  });

  it('deve isolar handlers por EventBus e validar eventos no modo dev', () => {
    const { sandbox } = criarSandbox();
    const busA = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const busB = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const sectionA = new sandbox.PageSection(new EventTargetStub(), { eventBus: busA });
    const sectionB = new sandbox.PageSection(new EventTargetStub(), { eventBus: busB });
    let recebidos = 0;

    sectionA.on(sandbox.SectionEventCatalog.AGENDA_READY, () => { recebidos += 1; });
    sectionB.emit(sandbox.SectionEventCatalog.AGENDA_READY, {});

    assert.equal(recebidos, 0);
    assert.throws(() => sectionA.emit('agenda.unknown', {}), /catalog/);
  });

  it('deve remover listeners, timers e observers ao destruir 100 secoes', () => {
    const { sandbox, timerHarness } = criarSandbox();
    const bus = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const targets = [];
    ObserverStub.active = 0;

    for (let i = 0; i < 100; i += 1) {
      const root = new EventTargetStub();
      const section = new sandbox.PageSection(root, { eventBus: bus });
      const handler = () => {};
      const observer = new sandbox.MutationObserver(handler);
      section.listen(root, 'click', handler);
      section.every(handler, 1000);
      section.observe(observer, root, { attributes: true });
      section.on(sandbox.SectionEventCatalog.AGENDA_READY, handler);
      targets.push(root);
      section.destroy();
    }

    assert.equal(targets.reduce((total, target) => total + target.listenerCount(), 0), 0);
    assert.equal(timerHarness.activeCount, 0);
    assert.equal(ObserverStub.active, 0);
    assert.equal(bus.listenerCount(), 0);
  });
});
