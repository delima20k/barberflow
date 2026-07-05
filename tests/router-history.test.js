'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

function criarTelaEl(nome) {
  return {
    id: `tela-${nome}`,
    classList: { add: fn(), remove: fn(), toggle: fn() },
    style: {},
    getAnimations: () => [],
  };
}

function criarHistoryMock(listeners) {
  const stack = [];
  let index = -1;

  const api = {
    pushState: fn((state) => {
      stack.splice(index + 1);
      stack.push(structuredClone(state));
      index = stack.length - 1;
    }),
    replaceState: fn((state) => {
      if (index < 0) {
        stack.push(structuredClone(state));
        index = 0;
        return;
      }
      stack[index] = structuredClone(state);
    }),
    back: fn(() => {
      if (index <= 0) return;
      index -= 1;
      listeners.popstate?.({ state: structuredClone(stack[index]) });
    }),
    _current: () => structuredClone(stack[index] ?? null),
    _stack: () => structuredClone(stack),
  };

  return api;
}

function criarRouter({ logado = true, telaInicial = 'inicio' } = {}) {
  const telaEls = new Map(
    ['inicio', 'perfil', 'pesquisa', 'mensagens', 'financas', 'login', 'cadastro']
      .map(nome => [nome, criarTelaEl(nome)]),
  );

  const listeners = {};
  const historyMock = criarHistoryMock(listeners);
  const viewMock = {
    init: fn(),
    removerBootLock: fn(),
    resetarParaHome: fn(),
    normalizarPreservando: fn(),
    sincronizarUI: fn(),
    exibirToastLoginObrigatorio: fn(),
    bindLoginEvent: fn(),
    telaEl: fn(nome => telaEls.get(nome) ?? null),
  };
  const animMock = { animar: fn() };
  const loggerMock = { info: fn(), warn: fn(), error: fn() };
  const appStateMock = {
    get: fn(key => (key === 'isLogado' ? logado : null)),
    set: fn(),
    onAuth: fn(),
  };

  const windowMock = {
    history: historyMock,
    addEventListener: fn((tipo, cb) => { listeners[tipo] = cb; }),
    __routerClickBound: false,
  };

  const sandbox = vm.createContext({
    console,
    structuredClone,
    setTimeout: () => {},
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: fn(), removeItem: fn() },
    window: windowMock,
    document: {
      title: 'BarberFlow',
      addEventListener: fn(),
      querySelectorAll: fn().mockReturnValue([]),
    },
    AppState: appStateMock,
  });

  carregar(sandbox, 'shared/js/Router.js');
  vm.runInContext(`
    class TestRouter extends Router {
      static #NAV = new Set(['inicio', 'perfil', 'pesquisa', 'mensagens', 'financas']);
      get telasComNav() { return TestRouter.#NAV; }
    }
    globalThis.TestRouter = TestRouter;
  `, sandbox);

  const router = new sandbox.TestRouter(telaInicial, {
    view: viewMock,
    animation: animMock,
    logger: loggerMock,
  });

  [
    viewMock.sincronizarUI, viewMock.telaEl, animMock.animar,
    historyMock.pushState, historyMock.replaceState, historyMock.back,
  ].forEach(spy => spy.mockClear());

  return { router, historyMock, listeners, viewMock, animMock, windowMock, telaEls, TestRouter: sandbox.TestRouter };
}

describe('Router History API', () => {
  test('inicializacao substitui a entrada atual e registra um unico popstate', () => {
    const { historyMock, windowMock } = criarRouter();

    assert.equal(historyMock._current().tela, 'inicio');
    assert.deepEqual(historyMock._current().historico, []);
    assert.equal(windowMock.addEventListener.calls.filter(call => call[0] === 'popstate').length, 1);
  });

  test('nav() empilha estado nativo com o mesmo historico interno', () => {
    const { router, historyMock } = criarRouter();

    router.nav('perfil');
    assert.equal(router._telaAtual, 'perfil');
    assert.deepEqual(Array.from(router._historico), ['inicio']);
    assert.equal(historyMock._current().tela, 'perfil');
    assert.deepEqual(historyMock._current().historico, ['inicio']);

    router.nav('mensagens');
    assert.equal(router._telaAtual, 'mensagens');
    assert.deepEqual(Array.from(router._historico), ['inicio', 'perfil']);
    assert.equal(historyMock._current().tela, 'mensagens');
    assert.deepEqual(historyMock._current().historico, ['inicio', 'perfil']);
  });

  test('popstate restaura a tela anterior sem criar nova entrada', () => {
    const { router, historyMock } = criarRouter();

    router.nav('perfil');
    router.nav('mensagens');
    historyMock.pushState.mockClear();

    historyMock.back();

    assert.equal(router._telaAtual, 'perfil');
    assert.deepEqual(Array.from(router._historico), ['inicio']);
    assert.equal(historyMock.pushState.calls.length, 0);
  });

  test('voltar() usa history.back quando existe entrada anterior do Router', () => {
    const { router, historyMock } = criarRouter();

    router.nav('perfil');
    router.voltar();

    assert.equal(historyMock.back.calls.length, 1);
    assert.equal(router._telaAtual, 'inicio');
    assert.deepEqual(Array.from(router._historico), []);
  });

  test('instancias repetidas nao duplicam listener popstate', () => {
    const { windowMock, viewMock, animMock, TestRouter } = criarRouter();

    new TestRouter('inicio', {
      view: viewMock,
      animation: animMock,
      logger: { info: fn(), warn: fn(), error: fn() },
    });

    const popstateCalls = windowMock.addEventListener.calls.filter(call => call[0] === 'popstate');
    assert.equal(popstateCalls.length, 1);
  });
});
