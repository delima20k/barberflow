'use strict';
/**
 * tests/navigation-manager.test.js
 *
 * Testa NavigationManager: beforeNavigate, preloadResources, awaitPreload, navigate.
 * Runner: node:test + node:assert/strict (nativo)
 *
 * Cenários cobertos:
 *   1. beforeNavigate — contexto igual: não inicia preload nem chama setCurrentContext
 *   2. beforeNavigate — novo contexto: chama setCurrentContext + inicia preload
 *   3. preloadResources — já em andamento: retorna mesma Promise (sem fetch duplo)
 *   4. preloadResources — dados já em cache: resolve sem chamar BarbershopRepository
 *   5. awaitPreload — contextId inexistente: resolve sem erro
 *   6. #doPreload — popula CacheManager com as 3 chaves corretas
 *   7. navigate — chama navFn exatamente uma vez
 *   8. navigate — navFn não-função: não lança erro
 *   9. Falha de rede em getById: preloadResources resolve (não rejeita) + cache vazio
 *  10. Shop null: cache não é populado + awaitPreload resolve normalmente
 *  11. Preloads concorrentes para contextos diferentes: ambos resolvem com dados corretos
 *  12. beforeNavigate idempotente: segundo call com mesmo id não dispara novo preload
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_A = 'a0000000-0000-4000-8000-000000000001';
const UUID_B = 'b0000000-0000-4000-8000-000000000002';

const SHOP_A     = { id: UUID_A, name: 'Barbearia A' };
const SHOP_B     = { id: UUID_B, name: 'Barbearia B' };
const SERVICOS   = [{ id: 's1', name: 'Corte', price: 30 }];
const PORTFOLIO  = [{ id: 'p1', thumbnail_path: 'img.jpg' }];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cria um thenable chain que resolve com { data: rows, error: null }. */
function makeChain(rows) {
  const c = {};
  ['select', 'eq', 'order', 'limit'].forEach(m => { c[m] = () => c; });
  c.then = (resolve, reject) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return c;
}

/**
 * Cria sandbox VM com CacheManager real + NavigationManager +
 * mocks controláveis de StateManager, BarbershopRepository, ApiService.
 *
 * @param {object} opts
 * @param {object|null}  opts.shopData     — dados retornados por getById (null = não encontrado)
 * @param {Error|null}   opts.getByIdError — se definido, getById rejeita com este erro
 * @param {string|null}  opts.ctxInicial   — contexto pré-carregado no StateManager mock
 */
function criarSandbox({ shopData = SHOP_A, getByIdError = null, ctxInicial = null } = {}) {
  const LoggerService = { warn: fn(), error: fn(), info: fn() };

  const BarbershopRepository = {
    getById: getByIdError
      ? fn().mockRejectedValue(getByIdError)
      : fn().mockResolvedValue(shopData),
  };

  const ApiService = {
    from: fn().mockImplementation(tabela =>
      tabela === 'services' ? makeChain(SERVICOS) : makeChain(PORTFOLIO)
    ),
  };

  // StateManager mock — rastreia contexto em closure para isContextChanged funcionar
  let _ctx = ctxInicial;
  const StateManager = {
    isContextChanged:  fn().mockImplementation(id => _ctx !== id),
    setCurrentContext: fn().mockImplementation(id => { _ctx = id; }),
    getCurrentContext: fn().mockImplementation(() => _ctx),
    resetState:        fn().mockImplementation(() => { _ctx = null; }),
  };

  const sb = vm.createContext({
    console, Error, TypeError, Promise, Map, Date,
    BarbershopRepository,
    ApiService,
    LoggerService,
    StateManager,
  });

  carregar(sb, 'shared/js/CacheManager.js');
  carregar(sb, 'shared/js/NavigationManager.js');

  // Expõe mocks para assertions externas
  sb._BarbershopRepository = BarbershopRepository;
  sb._ApiService           = ApiService;
  sb._LoggerService        = LoggerService;
  sb._StateManager         = StateManager;
  sb._getCtx               = () => _ctx;

  return sb;
}

// ─────────────────────────────────────────────────────────────────────────────
// beforeNavigate
// ─────────────────────────────────────────────────────────────────────────────

suite('NavigationManager.beforeNavigate()', () => {

  test('contexto igual: não chama setCurrentContext nem inicia preload', async () => {
    // UUID_A já é o contexto atual
    const sb = criarSandbox({ ctxInicial: UUID_A });

    sb.NavigationManager.beforeNavigate(UUID_A);

    assert.strictEqual(sb._StateManager.setCurrentContext.calls.length, 0,
      'setCurrentContext não deve ser chamado quando contexto é o mesmo');
    assert.strictEqual(sb._BarbershopRepository.getById.calls.length, 0,
      'getById não deve ser chamado quando contexto não muda');
  });

  test('novo contexto: chama setCurrentContext e inicia preload', async () => {
    const sb = criarSandbox({ ctxInicial: null });

    sb.NavigationManager.beforeNavigate(UUID_A);

    assert.strictEqual(sb._StateManager.setCurrentContext.calls.length, 1);
    assert.deepStrictEqual(sb._StateManager.setCurrentContext.calls[0], [UUID_A]);

    // Aguarda preload para não deixar Promise pendente no teste
    await sb.NavigationManager.awaitPreload(UUID_A);
  });

  test('idempotente: segundo call com mesmo id não dispara novo preload', async () => {
    const sb = criarSandbox({ ctxInicial: null });

    sb.NavigationManager.beforeNavigate(UUID_A);
    // Contexto já foi setado para UUID_A → segundo call é no-op
    sb.NavigationManager.beforeNavigate(UUID_A);

    assert.strictEqual(sb._StateManager.setCurrentContext.calls.length, 1,
      'setCurrentContext deve ser chamado apenas uma vez');

    await sb.NavigationManager.awaitPreload(UUID_A);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// preloadResources
// ─────────────────────────────────────────────────────────────────────────────

suite('NavigationManager.preloadResources()', () => {

  test('retorna mesma Promise quando preload já está em andamento', async () => {
    // getById não resolve até liberarmos manualmente (deferred)
    let resolveDeferred;
    const deferred = new Promise(r => { resolveDeferred = r; });

    const sb = criarSandbox();
    sb._BarbershopRepository.getById = fn().mockReturnValue(deferred);

    const p1 = sb.NavigationManager.preloadResources(UUID_A);
    const p2 = sb.NavigationManager.preloadResources(UUID_A);

    assert.strictEqual(p1, p2, 'deve retornar a mesma Promise para preloads simultâneos');
    assert.strictEqual(sb._BarbershopRepository.getById.calls.length, 1,
      'getById deve ser chamado apenas uma vez');

    // Libera o deferred para não deixar Promise pendente
    resolveDeferred(SHOP_A);
    await p1;
  });

  test('dados já em cache: resolve sem chamar BarbershopRepository', async () => {
    const sb = criarSandbox({ ctxInicial: UUID_A });

    // Popula cache manualmente
    sb.CacheManager.set(`${UUID_A}:shop`,      SHOP_A,    60000);
    sb.CacheManager.set(`${UUID_A}:servicos`,  SERVICOS,  60000);
    sb.CacheManager.set(`${UUID_A}:portfolio`, PORTFOLIO, 60000);

    await sb.NavigationManager.preloadResources(UUID_A);

    assert.strictEqual(sb._BarbershopRepository.getById.calls.length, 0,
      'getById não deve ser chamado quando dados já estão em cache');
  });

  test('ao finalizar, popula CacheManager com as 3 chaves corretas', async () => {
    const sb = criarSandbox();

    await sb.NavigationManager.preloadResources(UUID_A);

    const shop      = sb.CacheManager.get(`${UUID_A}:shop`);
    const servicos  = sb.CacheManager.get(`${UUID_A}:servicos`);
    const portfolio = sb.CacheManager.get(`${UUID_A}:portfolio`);

    assert.deepStrictEqual(shop,      SHOP_A,    'shop deve estar em cache');
    assert.deepStrictEqual(servicos,  SERVICOS,  'servicos devem estar em cache');
    assert.deepStrictEqual(portfolio, PORTFOLIO, 'portfolio deve estar em cache');
  });

  test('shop null: cache não é populado, preload resolve normalmente', async () => {
    const sb = criarSandbox({ shopData: null });

    // Não deve lançar
    await assert.doesNotReject(
      () => sb.NavigationManager.preloadResources(UUID_A)
    );

    assert.strictEqual(sb.CacheManager.get(`${UUID_A}:shop`), null,
      'cache não deve ser populado quando shop é null');
  });

  test('falha de rede: preloadResources resolve (não rejeita)', async () => {
    const networkError = new Error('Network error');
    const sb = criarSandbox({ getByIdError: networkError });

    await assert.doesNotReject(
      () => sb.NavigationManager.preloadResources(UUID_A),
      'preloadResources deve sempre resolver mesmo com erro de rede'
    );

    assert.ok(sb._LoggerService.warn.calls.length >= 1,
      'erro deve ser logado via LoggerService.warn');
  });

  test('preloads concorrentes para contextos diferentes: ambos resolvem com dados corretos', async () => {
    const sb = criarSandbox();
    // Override: getById retorna shop diferente por id
    sb._BarbershopRepository.getById = fn().mockImplementation(id =>
      Promise.resolve(id === UUID_A ? SHOP_A : SHOP_B)
    );

    await Promise.all([
      sb.NavigationManager.preloadResources(UUID_A),
      sb.NavigationManager.preloadResources(UUID_B),
    ]);

    assert.deepStrictEqual(sb.CacheManager.get(`${UUID_A}:shop`), SHOP_A);
    assert.deepStrictEqual(sb.CacheManager.get(`${UUID_B}:shop`), SHOP_B);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// awaitPreload
// ─────────────────────────────────────────────────────────────────────────────

suite('NavigationManager.awaitPreload()', () => {

  test('contextId sem preload em andamento: resolve imediatamente sem erro', async () => {
    const sb = criarSandbox();

    await assert.doesNotReject(
      () => sb.NavigationManager.awaitPreload('contexto-inexistente'),
      'awaitPreload deve resolver mesmo para contextId sem preload'
    );
  });

  test('resolve após o preload concluir', async () => {
    const sb = criarSandbox();

    // Inicia preload em background
    sb.NavigationManager.preloadResources(UUID_A);

    // awaitPreload deve aguardar e resolver
    await assert.doesNotReject(() => sb.NavigationManager.awaitPreload(UUID_A));

    // Cache deve estar populado após await
    assert.ok(sb.CacheManager.get(`${UUID_A}:shop`), 'cache deve estar populado após awaitPreload');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// navigate
// ─────────────────────────────────────────────────────────────────────────────

suite('NavigationManager.navigate()', () => {

  test('chama navFn exatamente uma vez', () => {
    const sb  = criarSandbox();
    const nav = fn();

    sb.NavigationManager.navigate(nav);

    assert.strictEqual(nav.calls.length, 1, 'navFn deve ser chamada uma única vez');
  });

  test('navFn não-função: não lança erro', () => {
    const sb = criarSandbox();

    assert.doesNotThrow(() => sb.NavigationManager.navigate(null));
    assert.doesNotThrow(() => sb.NavigationManager.navigate(undefined));
    assert.doesNotThrow(() => sb.NavigationManager.navigate(42));
  });

});
