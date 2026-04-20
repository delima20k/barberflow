'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

/** Retorna um elemento de tela stub com fn() no classList. */
function criarTelaEl(nome) {
  return {
    id:            `tela-${nome}`,
    classList:     { add: fn(), remove: fn(), toggle: fn() },
    style:         {},
    getAnimations: () => [],
  };
}

/**
 * Fábrica principal.
 * Cria um sandbox VM com Router carregado e retorna:
 *   router    — instância concreta de TestRouter (extends Router)
 *   viewMock  — mock de NavigationViewService com fn()
 *   loggerMock— mock de LoggerService com fn()
 *   animMock  — mock de AnimationService com fn()
 *   telaEls   — Map<nome, HTMLElement-stub> para verificar args de _animar()
 *   authState — { value: boolean } — mutável dentro dos testes
 *
 * @param {{ logado?: boolean, telaInicial?: string }} opts
 */
function criarRouter({ logado = false, telaInicial = 'inicio' } = {}) {
  // Elementos de tela disponíveis no DOM stub
  const telaEls = new Map(
    ['inicio', 'perfil', 'login', 'cadastro', 'pesquisa', 'mensagens', 'sair', 'destaques']
      .map(n => [n, criarTelaEl(n)])
  );

  // Mock da camada de apresentação (NavigationViewService)
  const viewMock = {
    init:                        fn(),
    removerBootLock:             fn(),
    resetarParaHome:             fn(),
    sincronizarUI:               fn(),
    exibirToastLoginObrigatorio: fn(),
    bindLoginEvent:              fn(),
    telaEl:                      fn(nome => telaEls.get(nome) ?? null),
  };

  const loggerMock = { info: fn(), warn: fn(), error: fn() };
  const animMock   = { animar: fn() };

  // Estado de auth mutável — permite virar logado/deslogado dentro de um teste
  const authState = { value: logado };

  // Stub de AppState — Router usa typeof + .get('isLogado')
  const appStateMock = {
    get:    fn(key => key === 'isLogado' ? authState.value : null),
    onAuth: fn(),
    set:    fn(),
  };

  // Sandbox VM com stubs mínimos — sem DOM real
  const sandbox = vm.createContext({
    console,
    setTimeout:   () => {},
    clearTimeout: () => {},
    // window.addEventListener é chamado no constructor (pageshow)
    window:   { addEventListener: fn(), __routerClickBound: false },
    // document.addEventListener é chamado em _bindDataAttributes
    document: { addEventListener: fn() },
    AppState: appStateMock,
  });

  // Carrega apenas o Router — NavigationViewService é totalmente mockado
  carregar(sandbox, 'shared/js/Router.js');

  // Subclasse concreta com telasComNav para poder testar footers e auth
  vm.runInContext(`
    class TestRouter extends Router {
      static #NAV = new Set(['inicio', 'perfil', 'mensagens', 'sair', 'destaques']);
      get telasComNav() { return TestRouter.#NAV; }
    }
    globalThis.TestRouter = TestRouter;
  `, sandbox);

  const router = new sandbox.TestRouter(telaInicial, {
    view:      viewMock,
    logger:    loggerMock,
    animation: animMock,
  });

  // Zera contadores: testes só observam o que acontece no método testado
  [
    viewMock.init, viewMock.removerBootLock, viewMock.sincronizarUI,
    viewMock.bindLoginEvent, viewMock.telaEl, viewMock.exibirToastLoginObrigatorio,
    viewMock.resetarParaHome, loggerMock.info, loggerMock.warn, loggerMock.error,
    animMock.animar, appStateMock.get, appStateMock.onAuth, appStateMock.set,
  ].forEach(fn => fn.mockClear());

  return { router, viewMock, loggerMock, animMock, telaEls, authState };
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — _permitirNavAuth()
// ─────────────────────────────────────────────────────────────────────────────

suite('Router — _permitirNavAuth()', () => {

  const TELAS_PUBLICAS = ['inicio', 'pesquisa', 'barbearias', 'barbeiros', 'login', 'cadastro', 'destaques'];

  for (const tela of TELAS_PUBLICAS) {
    test(`tela pública "${tela}" → true para visitante (sem auth)`, () => {
      const { router } = criarRouter({ logado: false, telaInicial: 'login' });
      assert.strictEqual(router._permitirNavAuth(tela), true);
    });
  }

  for (const tela of TELAS_PUBLICAS) {
    test(`tela pública "${tela}" → true para usuário logado`, () => {
      const { router } = criarRouter({ logado: true, telaInicial: 'login' });
      assert.strictEqual(router._permitirNavAuth(tela), true);
    });
  }

  test('tela privada + visitante → false + toast exibido', () => {
    // telaInicial='login' evita que _alertarLoginObrigatorio chame push('login')
    // (push('login') seria no-op pois já está em 'login')
    const { router, viewMock } = criarRouter({ logado: false, telaInicial: 'login' });

    const resultado = router._permitirNavAuth('perfil');

    assert.strictEqual(resultado, false);
    assert.strictEqual(viewMock.exibirToastLoginObrigatorio.calls.length, 1);
  });

  test('tela privada + visitante → _alertarLoginObrigatorio não chama push quando já em "login"', () => {
    const { router, animMock } = criarRouter({ logado: false, telaInicial: 'login' });

    router._permitirNavAuth('perfil');

    // push('login') não é chamado porque _telaAtual já é 'login'
    assert.strictEqual(animMock.animar.calls.length, 0);
    assert.strictEqual(router._telaAtual, 'login');
  });

  test('tela privada + logado → true, sem toast', () => {
    const { router, viewMock } = criarRouter({ logado: true, telaInicial: 'inicio' });

    const resultado = router._permitirNavAuth('perfil');

    assert.strictEqual(resultado, true);
    assert.strictEqual(viewMock.exibirToastLoginObrigatorio.calls.length, 0);
  });

  test('tela privada + visitante → push("login") é chamado (side-effect via _alertarLoginObrigatorio)', () => {
    // Parte de 'inicio' para que _alertarLoginObrigatorio possa chamar push('login')
    const { router, viewMock, animMock } = criarRouter({ logado: false, telaInicial: 'inicio' });

    router._permitirNavAuth('perfil');

    // Toast exibido E redireciona para login
    assert.strictEqual(viewMock.exibirToastLoginObrigatorio.calls.length, 1);
    assert.strictEqual(router._telaAtual, 'login');
    // Animação de push('login') disparada
    assert.strictEqual(animMock.animar.calls.length, 1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — nav()
// ─────────────────────────────────────────────────────────────────────────────

suite('Router — nav()', () => {

  test('nav("inicio") quando já em "inicio" → no-op', () => {
    const { router, viewMock, animMock } = criarRouter({ telaInicial: 'inicio' });

    router.nav('inicio');

    assert.strictEqual(router._telaAtual, 'inicio');
    assert.strictEqual(viewMock.sincronizarUI.calls.length, 0);
    assert.strictEqual(animMock.animar.calls.length, 0);
  });

  test('nav("perfil") quando em "perfil" → toggle: vai para "inicio"', () => {
    const { router, viewMock, animMock, telaEls } = criarRouter({ telaInicial: 'perfil' });

    router.nav('perfil');

    assert.strictEqual(router._telaAtual, 'inicio');
    assert.deepStrictEqual(router._historico, []);
    // _atualizarUI('inicio') foi chamado via sincronizarUI
    assert.strictEqual(viewMock.sincronizarUI.calls.length, 1);
    // Aba sai pela esquerda — home está por baixo
    assert.deepStrictEqual(animMock.animar.calls[animMock.animar.calls.length-1], [
      telaEls.get('perfil'), null, 'saindo', 'ativa'
    ]);
  });

  test('nav para tela privada como visitante → bloqueado, redireciona para "login"', () => {
    const { router, viewMock } = criarRouter({ logado: false, telaInicial: 'inicio' });

    router.nav('perfil');

    assert.strictEqual(router._telaAtual, 'login');   // redirecionado
    assert.strictEqual(viewMock.exibirToastLoginObrigatorio.calls.length, 1);
  });

  test('nav para tela inexistente no DOM → logger.warn, _telaAtual não muda', () => {
    const { router, loggerMock } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('tela-nao-existe-no-dom');

    assert.strictEqual(router._telaAtual, 'inicio');
    assert.strictEqual(loggerMock.warn.calls.length, 1);
    assert.ok(String(loggerMock.warn.calls[0][0]).includes('tela-nao-existe-no-dom'));
  });

  test('nav("perfil") logado de "inicio" → _telaAtual="perfil", historico=["inicio"]', () => {
    const { router } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('perfil');

    assert.strictEqual(router._telaAtual, 'perfil');
    assert.deepStrictEqual(router._historico, ['inicio']);
  });

  test('nav("perfil") de "inicio" → animação não-carrossel: home não sai', () => {
    const { router, animMock, telaEls } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('perfil');

    // carrossel = false (veio de 'inicio') → saindo=null, classeEntrada='ativa'
    assert.deepStrictEqual(animMock.animar.calls[animMock.animar.calls.length-1], [
      null, telaEls.get('perfil'), 'saindo', 'ativa'
    ]);
  });

  test('nav("mensagens") de "perfil" → animação carrossel', () => {
    const { router, animMock, telaEls } = criarRouter({ logado: true, telaInicial: 'perfil' });

    router.nav('mensagens');

    // carrossel = true (telaAnterior ≠ 'inicio') → saindo-direita + entrando-lento
    assert.deepStrictEqual(animMock.animar.calls[animMock.animar.calls.length-1], [
      telaEls.get('perfil'), telaEls.get('mensagens'), 'saindo-direita', 'entrando-lento'
    ]);
  });

  test('nav bem-sucedida → sincronizarUI chamado com a nova tela', () => {
    const { router, viewMock } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('perfil');

    assert.strictEqual(viewMock.sincronizarUI.calls.length, 1);
    const [tela] = viewMock.sincronizarUI.calls[0];
    assert.strictEqual(tela, 'perfil');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — push()
// ─────────────────────────────────────────────────────────────────────────────

suite('Router — push()', () => {

  test('push para mesma tela → no-op', () => {
    const { router, viewMock, animMock } = criarRouter({ telaInicial: 'login' });

    router.push('login');

    assert.strictEqual(router._telaAtual, 'login');
    assert.strictEqual(viewMock.sincronizarUI.calls.length, 0);
    assert.strictEqual(animMock.animar.calls.length, 0);
  });

  test('push para tela privada como visitante → bloqueado', () => {
    const { router, viewMock } = criarRouter({ logado: false, telaInicial: 'inicio' });

    router.push('perfil');

    assert.strictEqual(router._telaAtual, 'login');    // redirecionado
    assert.strictEqual(viewMock.exibirToastLoginObrigatorio.calls.length, 1);
  });

  test('push para tela inexistente → logger.warn, _telaAtual não muda', () => {
    const { router, loggerMock } = criarRouter({ logado: true, telaInicial: 'login' });

    router.push('tela-que-nao-existe');

    assert.strictEqual(router._telaAtual, 'login');
    assert.ok(String(loggerMock.warn.calls[0][0]).includes('tela-que-nao-existe'));
  });

  test('push("login") de "inicio" → _telaAtual="login", historico=["inicio"]', () => {
    const { router } = criarRouter({ telaInicial: 'inicio' });

    router.push('login');

    assert.strictEqual(router._telaAtual, 'login');
    assert.deepStrictEqual(router._historico, ['inicio']);
  });

  test('push("login") de "inicio" → animação: home não sai (null), login entra', () => {
    const { router, animMock, telaEls } = criarRouter({ telaInicial: 'inicio' });

    router.push('login');

    // push sempre usa saindo-direita + entrando-lento
    // telaAnterior='inicio' → atual=null
    assert.deepStrictEqual(animMock.animar.calls[animMock.animar.calls.length-1], [
      null, telaEls.get('login'), 'saindo-direita', 'entrando-lento'
    ]);
  });

  test('push("cadastro") de "login" → animação: login sai DIREITA, cadastro entra ESQUERDA', () => {
    const { router, animMock, telaEls } = criarRouter({ telaInicial: 'login' });

    router.push('cadastro');

    assert.deepStrictEqual(animMock.animar.calls[animMock.animar.calls.length-1], [
      telaEls.get('login'), telaEls.get('cadastro'), 'saindo-direita', 'entrando-lento'
    ]);
  });

  test('push bem-sucedido → sincronizarUI chamado com a tela destino', () => {
    const { router, viewMock } = criarRouter({ telaInicial: 'login' });

    router.push('cadastro');

    assert.strictEqual(viewMock.sincronizarUI.calls.length, 1);
    const [tela] = viewMock.sincronizarUI.calls[0];
    assert.strictEqual(tela, 'cadastro');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — voltar()
// ─────────────────────────────────────────────────────────────────────────────

suite('Router — voltar()', () => {

  test('voltar() de "inicio" → no-op', () => {
    const { router, viewMock, animMock } = criarRouter({ telaInicial: 'inicio' });

    router.voltar();

    assert.strictEqual(router._telaAtual, 'inicio');
    assert.strictEqual(viewMock.sincronizarUI.calls.length, 0);
    assert.strictEqual(animMock.animar.calls.length, 0);
  });

  test('voltar() de "perfil" → _telaAtual="inicio", historico limpo', () => {
    const { router } = criarRouter({ telaInicial: 'perfil' });
    router._historico = ['inicio'];

    router.voltar();

    assert.strictEqual(router._telaAtual, 'inicio');
    assert.deepStrictEqual(router._historico, []);
  });

  test('voltar() de "perfil" → animação: perfil sai ESQUERDA, home já está por baixo', () => {
    const { router, animMock, telaEls } = criarRouter({ telaInicial: 'perfil' });

    router.voltar();

    // home não entra (null) — já está por baixo
    assert.deepStrictEqual(animMock.animar.calls[animMock.animar.calls.length-1], [
      telaEls.get('perfil'), null, 'saindo', 'ativa'
    ]);
  });

  test('voltar() → sincronizarUI chamado com "inicio"', () => {
    const { router, viewMock } = criarRouter({ telaInicial: 'perfil' });

    router.voltar();

    assert.strictEqual(viewMock.sincronizarUI.calls.length, 1);
    const [tela] = viewMock.sincronizarUI.calls[0];
    assert.strictEqual(tela, 'inicio');
  });

  test('voltar() de "perfil" → animMock chamado exatamente uma vez', () => {
    const { router, animMock } = criarRouter({ telaInicial: 'perfil' });

    router.voltar();

    assert.strictEqual(animMock.animar.calls.length, 1);
  });

});
