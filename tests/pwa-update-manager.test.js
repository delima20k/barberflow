'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { carregar, fn, ROOT } = require('./_helpers.js');

function criarEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type) {
      for (const callback of listeners.get(type) ?? []) callback({ type });
    },
  };
}

function criarCenario({ waiting = null } = {}) {
  const worker = {
    state: 'installing',
    postMessage: fn(),
    ...criarEventTarget(),
  };
  const registration = {
    scope: 'https://app.barberflow.live/',
    waiting,
    installing: null,
    update: fn(() => Promise.resolve()),
    periodicSync: { register: fn(() => Promise.resolve()) },
    ...criarEventTarget(),
  };
  const serviceWorker = {
    controller: {},
    register: fn(() => Promise.resolve(registration)),
    ...criarEventTarget(),
  };
  const windowTarget = criarEventTarget();
  const documentTarget = {
    visibilityState: 'visible',
    readyState: 'loading',
    ...criarEventTarget(),
  };
  const storage = new Map();
  const reload = fn();
  const timers = [];
  const sandbox = vm.createContext({
    console,
    Promise,
    navigator: { serviceWorker },
    window: windowTarget,
    document: documentTarget,
    location: { reload },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    setTimeout: callback => {
      timers.push(callback);
      return timers.length;
    },
    LoggerService: { info: fn(), warn: fn() },
  });

  carregar(sandbox, 'shared/js/PwaUpdateManager.js');
  return {
    sandbox,
    worker,
    registration,
    serviceWorker,
    windowTarget,
    documentTarget,
    reload,
    timers,
  };
}

async function concluirRegistro(cenario) {
  cenario.windowTarget.dispatch('load');
  await new Promise(resolve => setImmediate(resolve));
}

describe('PwaUpdateManager', () => {
  it('registra o service worker sem usar o cache HTTP e ativa worker em espera', async () => {
    const waiting = { postMessage: fn() };
    const cenario = criarCenario({ waiting });

    cenario.sandbox.PwaUpdateManager.registrar({ nomeApp: 'BarberFlow Cliente' });
    await concluirRegistro(cenario);

    assert.equal(cenario.serviceWorker.register.calls.length, 1);
    assert.equal(cenario.serviceWorker.register.calls[0][0], './sw.js');
    assert.equal(cenario.serviceWorker.register.calls[0][1].scope, './');
    assert.equal(cenario.serviceWorker.register.calls[0][1].updateViaCache, 'none');
    assert.equal(waiting.postMessage.calls[0][0].type, 'SKIP_WAITING');
  });

  it('ativa a nova versao quando a instalacao termina', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.registration.installing = cenario.worker;
    cenario.registration.dispatch('updatefound');
    cenario.worker.state = 'installed';
    cenario.worker.dispatch('statechange');

    assert.equal(cenario.worker.postMessage.calls.length, 1);
    assert.equal(cenario.worker.postMessage.calls[0][0].type, 'SKIP_WAITING');
  });

  it('observa um worker que ja estava instalando quando o registro respondeu', async () => {
    const cenario = criarCenario();
    cenario.registration.installing = cenario.worker;
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.worker.state = 'installed';
    cenario.worker.dispatch('statechange');

    assert.equal(cenario.worker.postMessage.calls.length, 1);
  });

  it('recarrega uma unica vez quando a nova versao assume o controle', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.serviceWorker.dispatch('controllerchange');
    cenario.serviceWorker.dispatch('controllerchange');

    assert.equal(cenario.reload.calls.length, 1);
  });

  it('verifica atualizacao ao retornar do segundo plano', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);
    cenario.registration.update.mockClear();

    cenario.documentTarget.visibilityState = 'hidden';
    cenario.documentTarget.dispatch('visibilitychange');
    cenario.documentTarget.visibilityState = 'visible';
    cenario.documentTarget.dispatch('visibilitychange');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(cenario.registration.update.calls.length, 1);
  });
});

describe('Integracao PWA dos dois aplicativos', () => {
  it('delega o registro dos dois AppBootstrap ao gerenciador compartilhado', () => {
    for (const app of ['cliente', 'profissional']) {
      const source = fs.readFileSync(path.join(ROOT, `apps/${app}/assets/js/AppBootstrap.js`), 'utf8');
      assert.match(source, /PwaUpdateManager\.registrar\(/);
      assert.doesNotMatch(source, /navigator\.serviceWorker\.register\(/);
    }
  });

  it('carrega o gerenciador antes do AppBootstrap nos dois HTMLs', () => {
    for (const app of ['cliente', 'profissional']) {
      const html = fs.readFileSync(path.join(ROOT, `apps/${app}/index.html`), 'utf8');
      assert.match(html, /\/shared\/js\/PwaUpdateManager\.js/);
      assert.ok(
        html.indexOf('/shared/js/PwaUpdateManager.js') < html.indexOf('assets/js/AppBootstrap.js'),
        `${app} deve carregar PwaUpdateManager antes de AppBootstrap`,
      );
    }
  });

  it('mantem o novo worker em espera ate receber autorizacao do gerenciador', () => {
    for (const app of ['cliente', 'profissional']) {
      const sw = fs.readFileSync(path.join(ROOT, `apps/${app}/sw.js`), 'utf8');
      const install = sw.slice(sw.indexOf('static install(e)'), sw.indexOf('static activate(e)'));
      assert.doesNotMatch(install, /self\.skipWaiting\(/);
      assert.match(sw, /type === 'SKIP_WAITING'/);
      assert.match(install, /cache:\s*'reload'/);
    }
  });

  it('registra a classe compartilhada no CLASS_REGISTRY', () => {
    const registry = fs.readFileSync(path.join(ROOT, 'CLASS_REGISTRY.md'), 'utf8');
    assert.match(registry, /`PwaUpdateManager`[\s\S]*shared\/js\/PwaUpdateManager\.js/);
  });
});
