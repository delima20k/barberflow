'use strict';
/**
 * tests/duplicatas-init.test.js
 *
 * Garante que AppBootstrap, GeoService e NearbyBarbershopsWidget não disparam
 * chamadas duplicadas à BFF em um único carregamento de página.
 *
 * Cenário de race condition: AppBootstrap.init() chama GeoService.solicitarNaPrimeiraVez()
 * (paralelo, fire-and-forget) E NearbyBarbershopsWidget.init() sequencialmente.
 * Se GPS já concedido, init() chama #carregar() (call #1) e, logo depois,
 * solicitarNaPrimeiraVez() despacha geo:concedido → onGPSConcedido() → #carregar() (call #2 duplicada).
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: AppBootstrap — guard #initialized
// ─────────────────────────────────────────────────────────────────────────────

suite('AppBootstrap — guard #initialized', () => {

  function criarSandboxBootstrap() {
    const geoSolicit = fn();

    const sandbox = vm.createContext({
      console,
      Error,
      TypeError,
      Promise,
      // Globals do browser necessários para AppBootstrap não lançar fora do try-catch
      URLSearchParams: class URLSearchParams { constructor() {} get() { return null; } },
      CustomEvent:     class CustomEvent { constructor(type) { this.type = type; } },
      navigator:       {},   // sem serviceWorker → #registrarSW retorna cedo
      document:        { addEventListener: fn(), dispatchEvent: fn() },
      location:        { search: '' },
      sessionStorage:  { getItem: fn(() => null), setItem: fn() },
      window:          { addEventListener: fn() },
      LoggerService:   { warn: fn(), error: fn(), info: fn() },
      // Widget rastreado: GeoService.solicitarNaPrimeiraVez
      GeoService: { solicitarNaPrimeiraVez: geoSolicit },
      // Demais widgets omitidos — try-catch captura ReferenceError silenciosamente
    });

    carregar(sandbox, 'apps/cliente/assets/js/AppBootstrap.js');
    return { sandbox, geoSolicit };
  }

  test('init() chamado duas vezes → GeoService.solicitarNaPrimeiraVez chamado apenas uma vez', () => {
    const { sandbox, geoSolicit } = criarSandboxBootstrap();

    sandbox.AppBootstrap.init();
    sandbox.AppBootstrap.init(); // segunda chamada — deve ser ignorada pelo guard

    assert.equal(
      geoSolicit.calls.length, 1,
      'GeoService.solicitarNaPrimeiraVez deve ser chamado apenas uma vez',
    );
  });

  test('init() chamado duas vezes → widgets sequenciais não rodam em duplicidade', async () => {
    const { sandbox } = criarSandboxBootstrap();
    const chamadas = {
      nearby: 0,
      cards: 0,
      dest: 0,
      barbs: 0,
      todas: 0,
    };

    sandbox.NearbyBarbershopsWidget = {
      init:             async () => { chamadas.nearby += 1; },
      initHomeCards:    async () => { chamadas.cards  += 1; },
      initHomeDestaque: async () => { chamadas.dest   += 1; },
      initHomeBarbeiros: async () => { chamadas.barbs += 1; },
      initHomeTodas:    async () => { chamadas.todas  += 1; },
    };

    sandbox.AppBootstrap.init();
    sandbox.AppBootstrap.init();
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(chamadas, {
      nearby: 1,
      cards: 1,
      dest: 1,
      barbs: 1,
      todas: 1,
    });
  });

  test('init() chamado uma vez → GeoService.solicitarNaPrimeiraVez chamado normalmente', () => {
    const { sandbox, geoSolicit } = criarSandboxBootstrap();

    sandbox.AppBootstrap.init();

    assert.equal(
      geoSolicit.calls.length, 1,
      'GeoService.solicitarNaPrimeiraVez deve ser chamado na primeira init()',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: GeoService.solicitarNaPrimeiraVez — guard #solicitando
// ─────────────────────────────────────────────────────────────────────────────

suite('GeoService.solicitarNaPrimeiraVez — guard #solicitando', () => {

  function criarSandboxGeo() {
    const dispatchMock       = fn();
    const getCurrentPosition = fn((success) => {
      success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } });
    });

    const sandbox = vm.createContext({
      console,
      Error,
      TypeError,
      Promise,
      CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
      document:    { dispatchEvent: dispatchMock, addEventListener: fn() },
      navigator: {
        geolocation:  { getCurrentPosition },
        permissions:  { query: fn(async () => ({ state: 'granted' })) },
      },
      localStorage: { getItem: fn(() => null), setItem: fn(), removeItem: fn() },
    });

    carregar(sandbox, 'shared/js/GeoService.js');
    return { sandbox, dispatchMock, getCurrentPosition };
  }

  test('chamada dupla → geo:concedido disparado apenas uma vez', async () => {
    const { sandbox, dispatchMock } = criarSandboxGeo();

    await sandbox.GeoService.solicitarNaPrimeiraVez();
    await sandbox.GeoService.solicitarNaPrimeiraVez(); // segunda — deve ser ignorada

    // Aguarda o .then() interno de GeoService.obter().then(...) processar
    await new Promise(resolve => setTimeout(resolve, 0));

    const geoConc = dispatchMock.calls.filter(args => args[0]?.type === 'geo:concedido');
    assert.equal(geoConc.length, 1, 'geo:concedido deve ser disparado apenas uma vez');
  });

  test('chamada única → geo:concedido disparado normalmente', async () => {
    const { sandbox, dispatchMock } = criarSandboxGeo();

    await sandbox.GeoService.solicitarNaPrimeiraVez();
    await new Promise(resolve => setTimeout(resolve, 0));

    const geoConc = dispatchMock.calls.filter(args => args[0]?.type === 'geo:concedido');
    assert.equal(geoConc.length, 1, 'geo:concedido deve ser disparado após concessão');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: NearbyBarbershopsWidget — guard #carregando e { once: true }
// ─────────────────────────────────────────────────────────────────────────────

suite('NearbyBarbershopsWidget — guard #carregando e { once: true }', () => {

  const CONTAINER_ID = 'nearby-map-widget';

  /**
   * Cria um document mock com sistema de eventos que honra { once: true },
   * igual ao comportamento nativo do browser.
   */
  function criarMockDocument() {
    const eventListeners = {};

    const mockEl = {
      innerHTML:        '',
      style:            {},
      dataset:          {},
      appendChild:      fn(),
      querySelectorAll: fn(() => []),
      querySelector:    fn(() => null),
    };

    const mockDocument = {
      addEventListener: fn((type, cb, opts) => {
        if (!eventListeners[type]) eventListeners[type] = [];
        eventListeners[type].push({ cb, opts: opts ?? {} });
      }),
      // Remove { once: true } ANTES de invocar (comportamento nativo)
      dispatchEvent: fn((e) => {
        const snapshot = (eventListeners[e.type] || []).slice();
        eventListeners[e.type] = snapshot.filter(entry => !entry.opts.once);
        snapshot.forEach(entry => entry.cb(e));
      }),
      getElementById: fn((id) => (id === CONTAINER_ID ? mockEl : null)),
      createElement:  fn(() => ({
        className:        '',
        textContent:      '',
        innerHTML:        '',
        style:            {},
        dataset:          {},
        appendChild:      fn(),
        querySelectorAll: fn(() => []),
        querySelector:    fn(() => null),
      })),
    };

    return { mockDocument, mockEl, eventListeners };
  }

  function criarSandboxNBW() {
    const mockGetNearby = fn().mockResolvedValue([]);
    const mockGetTodas = fn().mockResolvedValue([]);
    const mockGetDestaque = fn().mockResolvedValue([]);
    const geoVerificar  = fn().mockResolvedValue('prompt'); // init() NÃO chama #carregar() por padrão
    const geoObter      = fn().mockResolvedValue({ lat: -23.55, lng: -46.63 });
    const { mockDocument, mockEl, eventListeners } = criarMockDocument();

    const sandbox = vm.createContext({
      console,
      Error,
      TypeError,
      Promise,
      CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
      document: mockDocument,
      GeoService: { verificarPermissao: geoVerificar, obter: geoObter },
      BarbeariaApiClient: {
        getNearby:   mockGetNearby,
        getTodas:    mockGetTodas,
        getDestaque: mockGetDestaque,
      },
      BarbershopService: {
        carregarFavoritos:      fn().mockResolvedValue(undefined),
        restaurarInteracoes:    fn(),
        calcRatingScore:        fn(() => 0),
        criarEstrelasHTML:      fn(() => ''),
        criarBotaoFavoritoCard: fn(() => mockEl),
      },
      LoggerService: { warn: fn(), error: fn(), info: fn() },
    });

    carregar(sandbox, 'shared/js/NearbyBarbershopsWidget.js');
    return { sandbox, mockGetNearby, mockGetTodas, mockGetDestaque, mockDocument, mockEl, geoVerificar, geoObter, eventListeners };
  }

  test('onGPSConcedido() chamado duas vezes simultâneas → getNearby chamado apenas uma vez', async () => {
    const { sandbox, mockGetNearby } = criarSandboxNBW();

    // init() seta #el sincronamente (antes do primeiro await)
    sandbox.NearbyBarbershopsWidget.init(CONTAINER_ID);

    // Duas chamadas concorrentes sem await entre elas — simula race condition real
    const p1 = sandbox.NearbyBarbershopsWidget.onGPSConcedido();
    const p2 = sandbox.NearbyBarbershopsWidget.onGPSConcedido();
    await Promise.all([p1, p2]);

    assert.equal(
      mockGetNearby.calls.length, 1,
      'getNearby deve ser chamado apenas uma vez mesmo com onGPSConcedido() duplicado',
    );
  });

  test('geo:concedido disparado duas vezes → segundo disparo não aciona nova busca', async () => {
    const { sandbox, mockGetNearby, mockDocument } = criarSandboxNBW();

    // Registra listeners (sem await — #el e listeners são setados sincronamente)
    sandbox.NearbyBarbershopsWidget.init(CONTAINER_ID);

    // Primeiro disparo
    mockDocument.dispatchEvent(new sandbox.CustomEvent('geo:concedido'));
    await new Promise(resolve => setTimeout(resolve, 0)); // deixa microtasks do handler completarem

    const chamadas1 = mockGetNearby.calls.length;

    // Segundo disparo — com { once: true } o listener já foi removido
    mockDocument.dispatchEvent(new sandbox.CustomEvent('geo:concedido'));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(chamadas1, 1, 'primeiro geo:concedido deve acionar uma busca');
    assert.equal(
      mockGetNearby.calls.length, chamadas1,
      'segundo geo:concedido não deve acionar nova busca',
    );
  });

  test('evento de GPS concedido dispara apenas um fluxo de carregamento (integração race condition)', async () => {
    const { sandbox, mockGetNearby, mockDocument, geoVerificar } = criarSandboxNBW();

    // GPS já concedido → init() vai chamar #carregar() via verificarPermissao()
    geoVerificar.mockResolvedValue('granted');

    // Inicia init() — seta #el e registra listeners sincronamente, depois aguarda verificarPermissao
    const initPromise = sandbox.NearbyBarbershopsWidget.init(CONTAINER_ID);

    // Dispatcha geo:concedido ENQUANTO init() está pausado no await verificarPermissao()
    // Simula solicitarNaPrimeiraVez() completando antes de init() continuar
    mockDocument.dispatchEvent(new sandbox.CustomEvent('geo:concedido'));

    await initPromise;
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(
      mockGetNearby.calls.length, 1,
      'getNearby deve ser chamado exatamente uma vez mesmo com race condition entre init() e geo:concedido',
    );
  });

  test('initHomeDestaque() com lista vazia limpa skeleton sem erro', async () => {
    const { sandbox, mockGetDestaque, mockEl } = criarSandboxNBW();
    mockGetDestaque.mockResolvedValue([]);

    await sandbox.NearbyBarbershopsWidget.initHomeDestaque(CONTAINER_ID);

    assert.equal(mockGetDestaque.calls.length, 1);
    assert.equal(mockEl.innerHTML, '');
  });

  test('initHomeDestaque() chamado duas vezes → getDestaque chamado apenas uma vez', async () => {
    const { sandbox, mockGetDestaque } = criarSandboxNBW();

    await sandbox.NearbyBarbershopsWidget.initHomeDestaque(CONTAINER_ID);
    await sandbox.NearbyBarbershopsWidget.initHomeDestaque(CONTAINER_ID);

    assert.equal(mockGetDestaque.calls.length, 1);
  });

  test('initHomeCards() concorrente → fallback getTodas chamado apenas uma vez', async () => {
    const { sandbox, mockGetTodas } = criarSandboxNBW();

    await Promise.all([
      sandbox.NearbyBarbershopsWidget.initHomeCards(CONTAINER_ID),
      sandbox.NearbyBarbershopsWidget.initHomeCards(CONTAINER_ID),
    ]);

    assert.equal(mockGetTodas.calls.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: NearbyBarbershopsWidget — #nearbyResultado compartilhado
// ─────────────────────────────────────────────────────────────────────────────

suite('NearbyBarbershopsWidget — #nearbyResultado compartilhado', () => {

  const SRC_WIDGET = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'shared/js/NearbyBarbershopsWidget.js'),
    'utf8',
  );

  test('#nearbyResultado existe como campo estático privado no fonte', () => {
    assert.ok(
      SRC_WIDGET.includes('#nearbyResultado'),
      '#nearbyResultado deve existir para compartilhar resultado de #carregar() com initHomeCards()',
    );
  });

  test('#carregar atualiza #nearbyResultado quando lista não está vazia', () => {
    const idxCarregar = SRC_WIDGET.indexOf('static async #carregar');
    assert.ok(idxCarregar > 0, '#carregar deve existir');
    // Pega o bloco até o final do método (próximo método estático ou fim de classe)
    const bloco = SRC_WIDGET.slice(idxCarregar, idxCarregar + 700);
    assert.ok(
      bloco.includes('#nearbyResultado'),
      '#carregar deve atribuir #nearbyResultado após buscar barbearias',
    );
  });

  test('initHomeCards verifica #nearbyResultado antes de chamar BarbeariaApiClient.getNearby', () => {
    const idxCards = SRC_WIDGET.indexOf('static async initHomeCards');
    assert.ok(idxCards > 0, 'initHomeCards deve existir');
    // Slice maior para cobrir o skeleton HTML extenso antes do bloco de negócio
    const blocoCards = SRC_WIDGET.slice(idxCards, idxCards + 4000);
    const idxNearby  = blocoCards.indexOf('#nearbyResultado');
    const idxGetNear = blocoCards.indexOf('BarbeariaApiClient.getNearby');
    assert.ok(
      idxNearby > 0,
      'initHomeCards deve ler #nearbyResultado para reaproveitar resultado de #carregar()',
    );
    assert.ok(
      idxGetNear < 0 || idxNearby < idxGetNear,
      '#nearbyResultado deve ser verificado ANTES de chamar BarbeariaApiClient.getNearby em initHomeCards',
    );
  });

});
