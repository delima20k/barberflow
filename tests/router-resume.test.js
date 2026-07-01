'use strict';
// =============================================================
// router-resume.test.js
// Cobre a retomada de sessão do PWA: persistir a última aba e
// restaurá-la no boot (cold-start), sem cair no login e sem
// restaurar telas de fluxo/detalhe.
// =============================================================
const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

function criarTelaEl(nome) {
  return {
    id:            `tela-${nome}`,
    classList:     { add: fn(), remove: fn(), toggle: fn() },
    style:         {},
    getAnimations: () => [],
  };
}

/** localStorage stub em memória com a mesma API do browser. */
function criarLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem:    (k) => (store.has(k) ? store.get(k) : null),
    setItem:    (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _store: store,
  };
}

/**
 * Monta um Router concreto com:
 *   - localStorage stub (persistência real)
 *   - setTimeout SÍNCRONO (executa restaurar() na hora)
 *   - AppState com estado de auth mutável e onAuth funcional
 */
function criarRouter({ logado = false, telaInicial = 'inicio', storageSeed = {}, nowMs = 1_000_000 } = {}) {
  const telaEls = new Map(
    ['inicio', 'perfil', 'login', 'cadastro', 'pesquisa', 'mensagens', 'financas', 'minha-barbearia', 'barbearia']
      .map(n => [n, criarTelaEl(n)])
  );

  const viewMock = {
    init:                 fn(),
    removerBootLock:      fn(),
    resetarParaHome:      fn(),
    normalizarPreservando: fn(),
    sincronizarUI:        fn(),
    exibirToastLoginObrigatorio: fn(),
    bindLoginEvent:       fn(),
    telaEl:               fn(nome => telaEls.get(nome) ?? null),
  };
  const loggerMock = { info: fn(), warn: fn(), error: fn() };
  const animMock   = { animar: fn() };

  const authState = { value: logado };
  const authListeners = [];
  const appStateMock = {
    get:    fn(key => (key === 'isLogado' ? authState.value : null)),
    set:    fn((key, v) => { if (key === 'isLogado') { authState.value = v; authListeners.forEach(cb => cb(v)); } }),
    onAuth: fn(cb => { authListeners.push(cb); return () => { const i = authListeners.indexOf(cb); if (i >= 0) authListeners.splice(i, 1); }; }),
  };

  const localStorageStub = criarLocalStorage(storageSeed);

  const sandbox = vm.createContext({
    console,
    Date:         { now: () => nowMs },
    JSON,
    setTimeout:   (cb) => { cb(); return 0; }, // síncrono para o teste
    clearTimeout: () => {},
    localStorage: localStorageStub,
    window:   { addEventListener: fn(), __routerClickBound: false },
    document: { addEventListener: fn(), querySelectorAll: fn().mockReturnValue([]) },
    AppState: appStateMock,
  });

  carregar(sandbox, 'shared/js/Router.js');
  vm.runInContext(`
    class TestRouter extends Router {
      static #NAV = new Set(['inicio', 'perfil', 'mensagens', 'financas', 'minha-barbearia']);
      get telasComNav() { return TestRouter.#NAV; }
    }
    globalThis.TestRouter = TestRouter;
  `, sandbox);

  const router = new sandbox.TestRouter(telaInicial, { view: viewMock, logger: loggerMock, animation: animMock });
  return { router, viewMock, telaEls, localStorageStub, appStateMock, authState };
}

const CHAVE = 'bf_ultima_tela';

describe('Router — persistência da última tela', () => {
  test('nav() para aba pública persiste a tela', () => {
    const { router, localStorageStub } = criarRouter({ logado: true, nowMs: 5000 });
    router.nav('pesquisa');
    const raw = localStorageStub.getItem(CHAVE);
    assert.ok(raw, 'deveria ter persistido algo');
    assert.deepEqual(JSON.parse(raw), { tela: 'pesquisa', ts: 5000 });
  });

  test('nav() para "inicio" limpa a persistência', () => {
    const { router, localStorageStub } = criarRouter({
      logado: true, telaInicial: 'perfil', storageSeed: { [CHAVE]: JSON.stringify({ tela: 'perfil', ts: 1 }) },
    });
    // toggle da aba já aberta volta para inicio
    router.nav('perfil');
    assert.equal(localStorageStub.getItem(CHAVE), null);
  });

  test('push() para tela de fluxo (login) NÃO persiste e limpa registro', () => {
    const { router, localStorageStub } = criarRouter({
      logado: false, storageSeed: { [CHAVE]: JSON.stringify({ tela: 'perfil', ts: 1 }) },
    });
    router.push('login');
    assert.equal(localStorageStub.getItem(CHAVE), null);
  });
});

describe('Router — restauração no boot', () => {
  test('restaura aba pública recente automaticamente', () => {
    const { router } = criarRouter({
      logado: false, nowMs: 10_000,
      storageSeed: { [CHAVE]: JSON.stringify({ tela: 'pesquisa', ts: 10_000 }) },
    });
    assert.equal(router._telaAtual, 'pesquisa');
  });

  test('NÃO restaura se o registro está velho (fora da janela de 30min)', () => {
    const { router } = criarRouter({
      logado: true, nowMs: 10_000_000,
      storageSeed: { [CHAVE]: JSON.stringify({ tela: 'financas', ts: 0 }) },
    });
    assert.equal(router._telaAtual, 'inicio');
  });

  test('tela privada só restaura após o login ser confirmado', () => {
    const { router, appStateMock } = criarRouter({
      logado: false, nowMs: 10_000,
      storageSeed: { [CHAVE]: JSON.stringify({ tela: 'financas', ts: 10_000 }) },
    });
    // Visitante ainda não logado → permanece em inicio
    assert.equal(router._telaAtual, 'inicio');
    // Sessão confirmada → restaura a aba privada
    appStateMock.set('isLogado', true);
    assert.equal(router._telaAtual, 'financas');
  });

  test('NÃO restaura tela de detalhe dependente de contexto (barbearia)', () => {
    const { router } = criarRouter({
      logado: true, nowMs: 10_000,
      storageSeed: { [CHAVE]: JSON.stringify({ tela: 'barbearia', ts: 10_000 }) },
    });
    assert.equal(router._telaAtual, 'inicio');
  });
});
