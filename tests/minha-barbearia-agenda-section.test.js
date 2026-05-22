'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const vm               = require('node:vm');
const { carregar }     = require('./_helpers.js');

class ElementStub {
  #selectorMap = new Map();

  constructor() {
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
  }

  querySelector(selector) {
    return this.#selectorMap.get(selector) ?? null;
  }

  map(selector, element) {
    this.#selectorMap.set(selector, element);
  }
}

function criarSandbox() {
  const sandbox = vm.createContext({ console, Map, Set, Object, Error });
  carregar(sandbox, 'events/catalog.js');
  carregar(sandbox, 'shared/js/SectionEventBus.js');
  carregar(sandbox, 'shared/js/PageSection.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js');
  return sandbox;
}

describe('AgendaSection State/View/Controller', () => {
  it('deve encapsular estado sem expor mutacao externa', () => {
    const sandbox = criarSandbox();
    const state = new sandbox.AgendaState({ phase: 'idle' });
    const snapshot = state.snapshot;
    snapshot.phase = 'external';
    state.setPhase('ready');

    assert.equal(state.phase, 'ready');
    assert.equal(state.snapshot.phase, 'ready');
  });

  it('deve renderizar placeholder controlado quando a raiz possui regiao Agenda', () => {
    const sandbox = criarSandbox();
    const root = new ElementStub();
    const output = new ElementStub();
    root.map('[data-minha-barbearia-agenda-section]', output);
    const view = new sandbox.AgendaView(root);

    view.render({ phase: 'ready', message: 'Agenda fica em AgendaPage.' });

    assert.equal(output.dataset.sectionPhase, 'ready');
    assert.equal(output.textContent, 'Agenda fica em AgendaPage.');
    assert.equal(output.hidden, false);
  });

  it('deve orquestrar state e view por injecao', () => {
    const sandbox = criarSandbox();
    const calls = [];
    const controller = new sandbox.AgendaController({
      state: new sandbox.AgendaState(),
      view: { render: snapshot => calls.push(snapshot.phase) },
      readyEvent: sandbox.SectionEventCatalog.AGENDA_READY,
    });

    controller.init();
    controller.render();
    controller.update({ message: 'mantido' });
    controller.destroy();

    assert.deepEqual(calls, ['ready', 'ready', 'ready', 'destroyed']);
    assert.equal(controller.state.phase, 'destroyed');
  });

  it('deve preservar snapshot DOM da secao Agenda', () => {
    const sandbox = criarSandbox();
    const root = new ElementStub();
    const output = new ElementStub();
    root.map('[data-minha-barbearia-agenda-section]', output);
    const bus = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const state = new sandbox.AgendaState({ message: 'Placeholder Agenda' });
    const view = new sandbox.AgendaView(root);
    const controller = new sandbox.AgendaController({
      state,
      view,
      readyEvent: sandbox.SectionEventCatalog.AGENDA_READY,
    });
    const section = new sandbox.AgendaSection(root, { eventBus: bus, controller });

    section.init();

    assert.deepEqual({
      phase: output.dataset.sectionPhase,
      hidden: output.hidden,
      text: output.textContent,
    }, {
      phase: 'ready',
      hidden: false,
      text: 'Placeholder Agenda',
    });
  });
});
