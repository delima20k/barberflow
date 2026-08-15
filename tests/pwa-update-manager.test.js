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
    removeEventListener(type, callback) {
      const lista = listeners.get(type);
      if (!lista) return;
      const i = lista.indexOf(callback);
      if (i !== -1) lista.splice(i, 1);
    },
    dispatch(type) {
      // Copia a lista: um listener pode se auto-remover durante o dispatch
      // (é o caso do PwaUpdateManager ao aplicar a atualizacao pendente).
      for (const callback of [...(listeners.get(type) ?? [])]) callback({ type });
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
  const intervalos = [];
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
    setInterval: (callback, ms) => {
      intervalos.push({ callback, ms });
      return intervalos.length;
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
    intervalos,
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

    // Fora da janela de boot (splash ja concluida): a troca e imediata.
    cenario.sandbox.PwaUpdateManager.liberarBoot();
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
    cenario.sandbox.PwaUpdateManager.liberarBoot(); // fora do boot
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
    cenario.sandbox.PwaUpdateManager.liberarBoot(); // fora do boot
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.worker.state = 'installed';
    cenario.worker.dispatch('statechange');

    assert.equal(cenario.worker.postMessage.calls.length, 1);
  });

  it('recarrega uma unica vez quando a nova versao assume o controle', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.liberarBoot(); // fora do boot
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.serviceWorker.dispatch('controllerchange');
    cenario.serviceWorker.dispatch('controllerchange');

    assert.equal(cenario.reload.calls.length, 1);
  });

  // ── Janela de boot (splash) ──────────────────────────────────────────────
  // A splash roda com animacao CSS: qualquer location.reload() no meio a
  // reinicia do zero. Por isso, durante o boot, nem a troca de SW nem o
  // reload podem acontecer.

  it('durante o boot NAO envia SKIP_WAITING ao worker em espera', async () => {
    const waiting = { postMessage: fn() };
    const cenario = criarCenario({ waiting });

    // Sem liberarBoot(): simula a splash ainda rodando.
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    assert.equal(waiting.postMessage.calls.length, 0,
      'trocar o SW durante a splash reiniciaria a animacao');
  });

  it('durante o boot NAO recarrega quando o controle muda', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.serviceWorker.dispatch('controllerchange');

    assert.equal(cenario.reload.calls.length, 0,
      'reload durante a splash reiniciaria a animacao do texto');
  });

  it('nao aplica a pendencia enquanto a aba segue visivel apos o boot', async () => {
    const waiting = { postMessage: fn() };
    const cenario = criarCenario({ waiting });
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.sandbox.PwaUpdateManager.liberarBoot(); // splash terminou

    cenario.documentTarget.visibilityState = 'visible';
    cenario.documentTarget.dispatch('visibilitychange');

    assert.equal(waiting.postMessage.calls.length, 0,
      'trocar o SW com o usuario olhando a tela seria intrusivo');
    assert.equal(cenario.reload.calls.length, 0);
  });

  it('aplica a troca pendente quando a aba fica oculta', async () => {
    const waiting = { postMessage: fn() };
    const cenario = criarCenario({ waiting });
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    assert.equal(waiting.postMessage.calls.length, 0, 'segurou durante o boot');

    cenario.sandbox.PwaUpdateManager.liberarBoot(); // splash terminou
    cenario.documentTarget.visibilityState = 'hidden';
    cenario.documentTarget.dispatch('visibilitychange');

    assert.equal(waiting.postMessage.calls.length, 1);
    assert.equal(waiting.postMessage.calls[0][0].type, 'SKIP_WAITING');
  });

  it('NUNCA recarrega ao ocultar a aba (voltar do 2o plano deve retomar, nao mostrar a splash)', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    // controllerchange vindo de fora (ex.: outra aba ativou o SW novo)
    cenario.serviceWorker.dispatch('controllerchange');
    assert.equal(cenario.reload.calls.length, 0, 'adiado durante o boot');

    cenario.sandbox.PwaUpdateManager.liberarBoot();
    cenario.documentTarget.visibilityState = 'hidden';
    cenario.documentTarget.dispatch('visibilitychange');

    assert.equal(cenario.reload.calls.length, 0,
      'recarregar em background faz o app voltar na splash em vez da tela onde estava');
  });

  it('liberarBoot e idempotente', async () => {
    const waiting = { postMessage: fn() };
    const cenario = criarCenario({ waiting });
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.sandbox.PwaUpdateManager.liberarBoot();
    cenario.sandbox.PwaUpdateManager.liberarBoot();
    cenario.sandbox.PwaUpdateManager.liberarBoot();

    cenario.documentTarget.visibilityState = 'hidden';
    cenario.documentTarget.dispatch('visibilitychange');

    assert.equal(waiting.postMessage.calls.length, 1, 'nao pode trocar o SW varias vezes');
  });

  // ── Primeira instalacao ──────────────────────────────────────────────────
  // O SW faz clients.claim() no activate. Sem controller anterior, esse claim
  // dispara controllerchange mesmo NAO havendo update — a pagina acabou de
  // baixar tudo da rede. Recarregar ali reiniciava a splash na primeira
  // abertura e, quando adiado, trazia a splash de volta ao retomar o app.

  it('primeira instalacao: controllerchange do claim nao recarrega nem fica pendente', async () => {
    const cenario = criarCenario();
    cenario.serviceWorker.controller = null; // ainda sem SW controlando
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.serviceWorker.dispatch('controllerchange');
    assert.equal(cenario.reload.calls.length, 0, 'primeira instalacao nao e update');

    // Nem depois: liberar o boot e ocultar a aba nao pode ressuscitar o reload.
    cenario.sandbox.PwaUpdateManager.liberarBoot();
    cenario.documentTarget.visibilityState = 'hidden';
    cenario.documentTarget.dispatch('visibilitychange');

    assert.equal(cenario.reload.calls.length, 0,
      'sem update real, nada deve recarregar em momento algum');
  });

  it('update real (ja havia controller) segue sendo tratado como atualizacao', async () => {
    const cenario = criarCenario();
    // controller ja existe por padrao no cenario => update de verdade
    cenario.sandbox.PwaUpdateManager.liberarBoot(); // fora do boot
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    cenario.serviceWorker.dispatch('controllerchange');

    assert.equal(cenario.reload.calls.length, 1,
      'troca de SW fora do boot, com controller anterior, recarrega normalmente');
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

  it('agenda verificação periódica ao registrar (cobre sessão longa em foreground, sem visibilitychange)', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);

    assert.equal(cenario.intervalos.length, 1, 'deve agendar exatamente 1 setInterval');
    assert.ok(cenario.intervalos[0].ms > 0 && cenario.intervalos[0].ms <= 30 * 60 * 1000,
      'intervalo deve ser da ordem de minutos, não horas — sessão longa não pode ficar sem checar por muito tempo');
  });

  it('verificação periódica só checa quando a aba está visível (evita gastar rede/bateria em background)', async () => {
    const cenario = criarCenario();
    cenario.sandbox.PwaUpdateManager.registrar();
    await concluirRegistro(cenario);
    cenario.registration.update.mockClear();

    cenario.documentTarget.visibilityState = 'hidden';
    cenario.intervalos[0].callback();
    assert.equal(cenario.registration.update.calls.length, 0, 'em background não deve chamar update()');

    cenario.documentTarget.visibilityState = 'visible';
    cenario.intervalos[0].callback();
    assert.equal(cenario.registration.update.calls.length, 1, 'visível deve chamar update()');
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
