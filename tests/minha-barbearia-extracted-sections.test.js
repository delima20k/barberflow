'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { carregar, ROOT } = require('./_helpers.js');

class ElementStub {
  #map = new Map();
  constructor() { this.dataset = {}; }
  querySelector(selector) { return this.#map.get(selector) ?? null; }
  map(selector, element) { this.#map.set(selector, element); }
}

const SECTION_FILES = [
  'StorySection', 'PortfolioSection', 'NotificationSection',
  'QueueSection', 'AnalyticsSection', 'SettingsSection',
];

function sandboxSections() {
  const sandbox = vm.createContext({ console, Date, Error, Map, Set, Object, Number });
  carregar(sandbox, 'shared/js/SectionEventCatalog.js');
  carregar(sandbox, 'shared/js/SectionEventBus.js');
  carregar(sandbox, 'shared/js/PageSection.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js');
  SECTION_FILES.forEach(name => {
    const stem = name.replace('Section', '');
    carregar(sandbox, `apps/profissional/assets/js/pages/MinhaBarbeariaPage/${name}/${stem}State.js`);
    carregar(sandbox, `apps/profissional/assets/js/pages/MinhaBarbeariaPage/${name}/${stem}View.js`);
    carregar(sandbox, `apps/profissional/assets/js/pages/MinhaBarbeariaPage/${name}/${stem}Controller.js`);
    carregar(sandbox, `apps/profissional/assets/js/pages/MinhaBarbeariaPage/${name}/${name}.js`);
  });
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js');
  return sandbox;
}

describe('MinhaBarbearia extracted sections', () => {
  it('tem Controller, State e View unitarios por secao', () => {
    const sandbox = sandboxSections();
    const root = new ElementStub();
    const bus = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const realtime = new sandbox.QueueRealtimeClient({ realtime: {}, timerApi: { setInterval() {}, clearInterval() {} } });

    SECTION_FILES.forEach(name => {
      const stem = name.replace('Section', '');
      const State = sandbox[`${stem}State`];
      const View = sandbox[`${stem}View`];
      const Controller = sandbox[`${stem}Controller`];
      const Section = sandbox[name];
      const extra = stem === 'Queue' ? { queueRealtimeClient: realtime } :
        stem === 'Notification' ? { queueRealtimeClient: realtime } : {};
      const state = new State();
      const view = new View(root);
      const controller = new Controller({ state, view, ...extra });
      const section = new Section(root, { eventBus: bus, controller });

      assert.doesNotThrow(() => view.render(state.snapshot), `${stem}View`);
      section.init();
      section.update({});
      section.destroy();
    });
    assert.equal(bus.listenerCount(), 0);
  });

  it('propaga SettingsChanged para Agenda e Notification via EventBus', () => {
    const sandbox = sandboxSections();
    const root = new ElementStub();
    const bus = new sandbox.SectionEventBus({ catalog: sandbox.SectionEventCatalog, dev: true });
    const settings = new sandbox.SettingsSection(root, {
      eventBus: bus,
      controller: new sandbox.SettingsController({ state: new sandbox.SettingsState(), view: new sandbox.SettingsView(root) }),
    });
    const agendaController = new sandbox.AgendaController({ state: new sandbox.AgendaState(), view: new sandbox.AgendaView(root) });
    const agenda = new sandbox.AgendaSection(root, { eventBus: bus, controller: agendaController });
    const notificationController = new sandbox.NotificationController({
      state: new sandbox.NotificationState(),
      view: new sandbox.NotificationView(root),
    });
    const notification = new sandbox.NotificationSection(root, { eventBus: bus, controller: notificationController });
    agenda.init();
    notification.init();
    settings.init();

    settings.update({ changedAt: '2026-05-22T12:00:00.000Z' });

    assert.equal(agendaController.state.snapshot.lastSettingsChange, '2026-05-22T12:00:00.000Z');
    assert.doesNotThrow(() => notification.update({}));
    [settings, agenda, notification].forEach(section => section.destroy());
    assert.equal(bus.listenerCount(), 0);
  });

  it('mantem o shell e cada pasta com tamanho rastreavel para carregamento independente', () => {
    const shell = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js'), 'utf8');
    assert.ok(shell.split(/\r?\n/).length < 300, 'shell deve ficar abaixo de 300 linhas');
    SECTION_FILES.forEach(name => {
      const dir = path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage', name);
      const bytes = fs.readdirSync(dir).reduce((total, file) => total + fs.statSync(path.join(dir, file)).size, 0);
      assert.ok(bytes > 0 && bytes < 32000, `${name} deve continuar carregavel isoladamente`);
    });
  });
});
