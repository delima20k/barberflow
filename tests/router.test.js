'use strict';

/**
 * tests/router.test.js
 *
 * Testes automatizados para o Router SPA base.
 * Cobre: nav(), push(), voltar(), _permitirNavAuth()
 *
 * Runner: Jest — npm test
 *
 * Estratégia de isolamento:
 *   Cada teste cria um contexto VM isolado via criarRouter().
 *   Todos os serviços (view, logger, animation) são injetados como mocks Jest.
 *   AppState é stubado para controle direto do estado de auth.
 *   O DOM nunca é acessado — a classe NavigationViewService não é carregada.
 *
 * Convenção:
 *   criarRouter() sempre zera os contadores dos mocks após o constructor.
 *   Assertivas refletem apenas o que aconteceu durante o método testado.
 */

const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// ─── Infraestrutura de isolamento ────────────────────────────────────────────

/**
 * Carrega um arquivo JS plain-class no contexto VM informado e exporta
 * as classes/constantes declaradas em topo para globalThis do sandbox.
 */
function carregar(sandbox, relPath) {
  const raw   = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const nomes = [...raw.matchAll(/^(?:class|const)\s+([A-Z][A-Za-z0-9_]*)/gm)].map(m => m[1]);
  const exp   = nomes.map(n => `if(typeof ${n}!=='undefined') globalThis.${n}=${n};`).join('\n');
  vm.runInContext(`${raw}\n${exp}`, sandbox);
}

/** Retorna um elemento de tela stub com jest.fn() no classList. */
function criarTelaEl(nome) {
  return {
    id:            `tela-${nome}`,
    classList:     { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
    style:         {},
    getAnimations: () => [],
  };
}

/**
 * Fábrica principal.
 * Cria um sandbox VM com Router carregado e retorna:
 *   router    — instância concreta de TestRouter (extends Router)
 *   viewMock  — mock de NavigationViewService com jest.fn()
 *   loggerMock— mock de LoggerService com jest.fn()
 *   animMock  — mock de AnimationService com jest.fn()
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
    init:                        jest.fn(),
    removerBootLock:             jest.fn(),
    resetarParaHome:             jest.fn(),
    sincronizarUI:               jest.fn(),
    exibirToastLoginObrigatorio: jest.fn(),
    bindLoginEvent:              jest.fn(),
    telaEl:                      jest.fn(nome => telaEls.get(nome) ?? null),
  };

  const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const animMock   = { animar: jest.fn() };

  // Estado de auth mutável — permite virar logado/deslogado dentro de um teste
  const authState = { value: logado };

  // Stub de AppState — Router usa typeof + .get('isLogado')
  const appStateMock = {
    get:    jest.fn(key => key === 'isLogado' ? authState.value : null),
    onAuth: jest.fn(),
    set:    jest.fn(),
  };

  // Sandbox VM com stubs mínimos — sem DOM real
  const sandbox = vm.createContext({
    console,
    setTimeout:   () => {},
    clearTimeout: () => {},
    // window.addEventListener é chamado no constructor (pageshow)
    window:   { addEventListener: jest.fn(), __routerClickBound: false },
    // document.addEventListener é chamado em _bindDataAttributes
    document: { addEventListener: jest.fn() },
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

describe('Router — _permitirNavAuth()', () => {

  const TELAS_PUBLICAS = ['inicio', 'pesquisa', 'barbearias', 'barbeiros', 'login', 'cadastro', 'destaques'];

  test.each(TELAS_PUBLICAS)(
    'tela pública "%s" → true para visitante (sem auth)',
    (tela) => {
      const { router } = criarRouter({ logado: false, telaInicial: 'login' });
      expect(router._permitirNavAuth(tela)).toBe(true);
    }
  );

  test.each(TELAS_PUBLICAS)(
    'tela pública "%s" → true para usuário logado',
    (tela) => {
      const { router } = criarRouter({ logado: true, telaInicial: 'login' });
      expect(router._permitirNavAuth(tela)).toBe(true);
    }
  );

  test('tela privada + visitante → false + toast exibido', () => {
    // telaInicial='login' evita que _alertarLoginObrigatorio chame push('login')
    // (push('login') seria no-op pois já está em 'login')
    const { router, viewMock } = criarRouter({ logado: false, telaInicial: 'login' });

    const resultado = router._permitirNavAuth('perfil');

    expect(resultado).toBe(false);
    expect(viewMock.exibirToastLoginObrigatorio).toHaveBeenCalledTimes(1);
  });

  test('tela privada + visitante → _alertarLoginObrigatorio não chama push quando já em "login"', () => {
    const { router, animMock } = criarRouter({ logado: false, telaInicial: 'login' });

    router._permitirNavAuth('perfil');

    // push('login') não é chamado porque _telaAtual já é 'login'
    expect(animMock.animar).not.toHaveBeenCalled();
    expect(router._telaAtual).toBe('login');
  });

  test('tela privada + logado → true, sem toast', () => {
    const { router, viewMock } = criarRouter({ logado: true, telaInicial: 'inicio' });

    const resultado = router._permitirNavAuth('perfil');

    expect(resultado).toBe(true);
    expect(viewMock.exibirToastLoginObrigatorio).not.toHaveBeenCalled();
  });

  test('tela privada + visitante → push("login") é chamado (side-effect via _alertarLoginObrigatorio)', () => {
    // Parte de 'inicio' para que _alertarLoginObrigatorio possa chamar push('login')
    const { router, viewMock, animMock } = criarRouter({ logado: false, telaInicial: 'inicio' });

    router._permitirNavAuth('perfil');

    // Toast exibido E redireciona para login
    expect(viewMock.exibirToastLoginObrigatorio).toHaveBeenCalledTimes(1);
    expect(router._telaAtual).toBe('login');
    // Animação de push('login') disparada
    expect(animMock.animar).toHaveBeenCalledTimes(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — nav()
// ─────────────────────────────────────────────────────────────────────────────

describe('Router — nav()', () => {

  test('nav("inicio") quando já em "inicio" → no-op', () => {
    const { router, viewMock, animMock } = criarRouter({ telaInicial: 'inicio' });

    router.nav('inicio');

    expect(router._telaAtual).toBe('inicio');
    expect(viewMock.sincronizarUI).not.toHaveBeenCalled();
    expect(animMock.animar).not.toHaveBeenCalled();
  });

  test('nav("perfil") quando em "perfil" → toggle: vai para "inicio"', () => {
    const { router, viewMock, animMock, telaEls } = criarRouter({ telaInicial: 'perfil' });

    router.nav('perfil');

    expect(router._telaAtual).toBe('inicio');
    expect(router._historico).toEqual([]);
    // _atualizarUI('inicio') foi chamado via sincronizarUI
    expect(viewMock.sincronizarUI).toHaveBeenCalledTimes(1);
    // Aba sai pela esquerda — home está por baixo
    expect(animMock.animar).toHaveBeenCalledWith(
      telaEls.get('perfil'), null, 'saindo', 'ativa'
    );
  });

  test('nav para tela privada como visitante → bloqueado, redireciona para "login"', () => {
    const { router, viewMock } = criarRouter({ logado: false, telaInicial: 'inicio' });

    router.nav('perfil');

    expect(router._telaAtual).toBe('login');   // redirecionado
    expect(viewMock.exibirToastLoginObrigatorio).toHaveBeenCalledTimes(1);
  });

  test('nav para tela inexistente no DOM → logger.warn, _telaAtual não muda', () => {
    const { router, loggerMock } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('tela-nao-existe-no-dom');

    expect(router._telaAtual).toBe('inicio');
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('tela-nao-existe-no-dom')
    );
  });

  test('nav("perfil") logado de "inicio" → _telaAtual="perfil", historico=["inicio"]', () => {
    const { router } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('perfil');

    expect(router._telaAtual).toBe('perfil');
    expect(router._historico).toEqual(['inicio']);
  });

  test('nav("perfil") de "inicio" → animação não-carrossel: home não sai', () => {
    const { router, animMock, telaEls } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('perfil');

    // carrossel = false (veio de 'inicio') → saindo=null, classeEntrada='ativa'
    expect(animMock.animar).toHaveBeenCalledWith(
      null, telaEls.get('perfil'), 'saindo', 'ativa'
    );
  });

  test('nav("mensagens") de "perfil" → animação carrossel', () => {
    const { router, animMock, telaEls } = criarRouter({ logado: true, telaInicial: 'perfil' });

    router.nav('mensagens');

    // carrossel = true (telaAnterior ≠ 'inicio') → saindo-direita + entrando-lento
    expect(animMock.animar).toHaveBeenCalledWith(
      telaEls.get('perfil'), telaEls.get('mensagens'), 'saindo-direita', 'entrando-lento'
    );
  });

  test('nav bem-sucedida → sincronizarUI chamado com a nova tela', () => {
    const { router, viewMock } = criarRouter({ logado: true, telaInicial: 'inicio' });

    router.nav('perfil');

    expect(viewMock.sincronizarUI).toHaveBeenCalledTimes(1);
    const [tela] = viewMock.sincronizarUI.mock.calls[0];
    expect(tela).toBe('perfil');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — push()
// ─────────────────────────────────────────────────────────────────────────────

describe('Router — push()', () => {

  test('push para mesma tela → no-op', () => {
    const { router, viewMock, animMock } = criarRouter({ telaInicial: 'login' });

    router.push('login');

    expect(router._telaAtual).toBe('login');
    expect(viewMock.sincronizarUI).not.toHaveBeenCalled();
    expect(animMock.animar).not.toHaveBeenCalled();
  });

  test('push para tela privada como visitante → bloqueado', () => {
    const { router, viewMock } = criarRouter({ logado: false, telaInicial: 'inicio' });

    router.push('perfil');

    expect(router._telaAtual).toBe('login');    // redirecionado
    expect(viewMock.exibirToastLoginObrigatorio).toHaveBeenCalledTimes(1);
  });

  test('push para tela inexistente → logger.warn, _telaAtual não muda', () => {
    const { router, loggerMock } = criarRouter({ logado: true, telaInicial: 'login' });

    router.push('tela-que-nao-existe');

    expect(router._telaAtual).toBe('login');
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('tela-que-nao-existe')
    );
  });

  test('push("login") de "inicio" → _telaAtual="login", historico=["inicio"]', () => {
    const { router } = criarRouter({ telaInicial: 'inicio' });

    router.push('login');

    expect(router._telaAtual).toBe('login');
    expect(router._historico).toEqual(['inicio']);
  });

  test('push("login") de "inicio" → animação: home não sai (null), login entra', () => {
    const { router, animMock, telaEls } = criarRouter({ telaInicial: 'inicio' });

    router.push('login');

    // push sempre usa saindo-direita + entrando-lento
    // telaAnterior='inicio' → atual=null
    expect(animMock.animar).toHaveBeenCalledWith(
      null, telaEls.get('login'), 'saindo-direita', 'entrando-lento'
    );
  });

  test('push("cadastro") de "login" → animação: login sai DIREITA, cadastro entra ESQUERDA', () => {
    const { router, animMock, telaEls } = criarRouter({ telaInicial: 'login' });

    router.push('cadastro');

    expect(animMock.animar).toHaveBeenCalledWith(
      telaEls.get('login'), telaEls.get('cadastro'), 'saindo-direita', 'entrando-lento'
    );
  });

  test('push bem-sucedido → sincronizarUI chamado com a tela destino', () => {
    const { router, viewMock } = criarRouter({ telaInicial: 'login' });

    router.push('cadastro');

    expect(viewMock.sincronizarUI).toHaveBeenCalledTimes(1);
    const [tela] = viewMock.sincronizarUI.mock.calls[0];
    expect(tela).toBe('cadastro');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — voltar()
// ─────────────────────────────────────────────────────────────────────────────

describe('Router — voltar()', () => {

  test('voltar() de "inicio" → no-op', () => {
    const { router, viewMock, animMock } = criarRouter({ telaInicial: 'inicio' });

    router.voltar();

    expect(router._telaAtual).toBe('inicio');
    expect(viewMock.sincronizarUI).not.toHaveBeenCalled();
    expect(animMock.animar).not.toHaveBeenCalled();
  });

  test('voltar() de "perfil" → _telaAtual="inicio", historico limpo', () => {
    const { router } = criarRouter({ telaInicial: 'perfil' });
    router._historico = ['inicio'];

    router.voltar();

    expect(router._telaAtual).toBe('inicio');
    expect(router._historico).toEqual([]);
  });

  test('voltar() de "perfil" → animação: perfil sai ESQUERDA, home já está por baixo', () => {
    const { router, animMock, telaEls } = criarRouter({ telaInicial: 'perfil' });

    router.voltar();

    // home não entra (null) — já está por baixo
    expect(animMock.animar).toHaveBeenCalledWith(
      telaEls.get('perfil'), null, 'saindo', 'ativa'
    );
  });

  test('voltar() → sincronizarUI chamado com "inicio"', () => {
    const { router, viewMock } = criarRouter({ telaInicial: 'perfil' });

    router.voltar();

    expect(viewMock.sincronizarUI).toHaveBeenCalledTimes(1);
    const [tela] = viewMock.sincronizarUI.mock.calls[0];
    expect(tela).toBe('inicio');
  });

  test('voltar() de "perfil" → animMock chamado exatamente uma vez', () => {
    const { router, animMock } = criarRouter({ telaInicial: 'perfil' });

    router.voltar();

    expect(animMock.animar).toHaveBeenCalledTimes(1);
  });

});
