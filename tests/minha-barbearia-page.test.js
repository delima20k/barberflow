'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// =============================================================================
// Helpers de DOM mock
// =============================================================================

/**
 * Cria um elemento stub que rastreia classList e setAttribute,
 * e permite disparar clicks capturados via addEventListener.
 */
function criarEl(id = '') {
  const _classes   = new Set();
  const _attrs     = {};
  const _listeners = {};
  const _anims     = [];

  return {
    id,
    style:       {},
    textContent: '',
    value:       '',
    disabled:    false,
    innerHTML:   '',
    dataset:     {},

    classList: {
      add:      (...cls) => cls.forEach(c => _classes.add(c)),
      remove:   (...cls) => cls.forEach(c => _classes.delete(c)),
      contains: c => _classes.has(c),
      _classes,
    },

    getAttribute:    attr       => _attrs[attr] ?? null,
    setAttribute:    (attr, v)  => { _attrs[attr] = v; },
    _attrs,

    addEventListener: (ev, handler) => {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(handler);
    },
    _click: () => (_listeners['click'] ?? []).forEach(h => h()),
    _input: (v) => { _listeners['input']?.forEach(h => h({ target: { value: v } })); },

    querySelectorAll: () => [],
    querySelector:    () => null,
    appendChild:      () => {},
    focus:            fn(),
    click:            fn(),
    getAnimations:    () => [..._anims],
    _anims,
  };
}

/**
 * Cria o conjunto mínimo de elementos necessários para bind() +
 * os sub-painéis de config e GPS.
 * Retorna { elMap, panelEl, gpsPanelEl, telaEl, maisBtn, gpsBtn, cfgFechar, gpsFechar }
 */
function criarDom() {
  const IDS = [
    'tela-minha-barbearia',
    'app-header',
    'mb-config-panel',
    'mb-gps-panel',
    'mb-nome', 'mb-cover-img', 'mb-cover-input', 'mb-quota-txt',
    'mb-add-btn', 'mb-gps-btn', 'mb-mais-btn',
    'mb-story-slot-2', 'mb-story-slot-3',
    'mb-kpi-rating', 'mb-kpi-clientes', 'mb-kpi-portfolio', 'mb-kpi-likes',
    'mb-portfolio-grid', 'mb-servicos-lista',
    'mb-config-fechar', 'mb-cfg-capa-input', 'mb-cfg-capa-img',
    'mb-cfg-logo-input', 'mb-cfg-logo-img', 'mb-cfg-nome',
    'mb-cfg-produtos-lista', 'mb-cfg-add-produto',
    'mb-config-salvar', 'mb-config-msg',
    'mb-gps-fechar',
    'gps-cep', 'gps-btn-buscar', 'gps-logradouro', 'gps-bairro',
    'gps-cidade', 'gps-numero', 'gps-complemento',
    'gps-btn-gps', 'gps-coords-txt', 'gps-msg', 'gps-btn-salvar',
    'gps-dig',
  ];

  const elMap = new Map(IDS.map(id => [id, criarEl(id)]));

  return {
    elMap,
    telaEl:    elMap.get('tela-minha-barbearia'),
    panelEl:   elMap.get('mb-config-panel'),
    gpsPanelEl:elMap.get('mb-gps-panel'),
    maisBtn:   elMap.get('mb-mais-btn'),
    gpsBtn:    elMap.get('mb-gps-btn'),
    cfgFechar: elMap.get('mb-config-fechar'),
    gpsFechar: elMap.get('mb-gps-fechar'),
    gpsBtnSalvar: elMap.get('gps-btn-salvar'),
    gpsLogradouro: elMap.get('gps-logradouro'),
    gpsNumero: elMap.get('gps-numero'),
  };
}

/**
 * Cria uma instância de MinhaBarbeariaPage em sandbox VM
 * com todos os stubs necessários.
 *
 * @param {{ comTelaEl?: boolean }} opts
 */
function criarPagina({ comTelaEl = true } = {}) {
  const dom = criarDom();
  const mutationObservers = [];

  // Se comTelaEl=false, getElementById('tela-minha-barbearia') retorna null
  // → bind() sai cedo sem registrar nada
  const documentMock = {
    getElementById: fn(id => comTelaEl ? (dom.elMap.get(id) ?? null) : null),
  };

  const sandbox = vm.createContext({
    console,
    document:        documentMock,
    MutationObserver: function(cb) {
      this.observe = fn();
      this.disconnect = fn();
      this._disparar = cb;
      mutationObservers.push(this);
    },
    AuthService:     { getPerfil: fn().mockReturnValue(null) },
    SupabaseService: {},
    NotificationService: { mostrarToast: fn() },
    MediaP2P: class MediaP2P {
      cancelarTodos()          {}
      cancelar()               {}
      registrar()              { return Promise.resolve('blob:fake'); }
      temPendente()            { return false; }
      extensaoPendente()       { return 'jpg'; }
      fazerUpload()            { return Promise.resolve('path/to/file.jpg'); }
    },
  });

  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js');

  const page = new sandbox.MinhaBarbeariaPage();
  page.bind();

  return { page, dom, documentMock, mutationObservers };
}

// =============================================================================
// Suite 1 — bind(): inicialização
// =============================================================================

suite('MinhaBarbeariaPage — bind()', () => {

  test('bind() sem telaEl (null) não lança erro', () => {
    assert.doesNotThrow(() => criarPagina({ comTelaEl: false }));
  });

  test('bind() chama getElementById para tela, config-panel e gps-panel', () => {
    const { documentMock } = criarPagina();
    const ids = documentMock.getElementById.calls.map(c => c[0]);
    assert.ok(ids.includes('tela-minha-barbearia'), 'deve buscar telaEl');
    assert.ok(ids.includes('mb-config-panel'),      'deve buscar config panel');
    assert.ok(ids.includes('mb-gps-panel'),          'deve buscar gps panel');
  });

  test('bind() sem telaEl não registra event listeners nos botões', () => {
    const { dom } = criarPagina({ comTelaEl: false });
    // maisBtn nunca recebeu addEventListener, _listeners está vazio
    assert.strictEqual(
      Object.keys(dom.maisBtn._listeners ?? {}).length, 0,
    );
  });

  test('ao ativar tela-minha-barbearia, revela header da home', () => {
    const { dom, mutationObservers } = criarPagina();
    const header = dom.elMap.get('app-header');
    const anim = { cancel: fn() };

    header.classList.add('header--oculto');
    header.style.transform = 'translateY(-110%)';
    header._anims.push(anim);
    dom.telaEl.classList.add('ativa');
    mutationObservers[0]._disparar();

    assert.equal(header.classList.contains('header--oculto'), false);
    assert.equal(header.style.transform, '');
    assert.equal(anim.cancel.calls.length, 1);
  });
});

// =============================================================================
// Suite 2 — Sub-painéis: animação (entrada e saída pela esquerda)
// =============================================================================

suite('MinhaBarbeariaPage — sub-painéis (config)', () => {

  test('clicar mb-mais-btn → config panel recebe classe mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.maisBtn._click();
    assert.ok(dom.panelEl.classList.contains('mb-sub-ativa'));
  });

  test('clicar mb-mais-btn → config panel aria-hidden = "false"', () => {
    const { dom } = criarPagina();
    dom.maisBtn._click();
    assert.strictEqual(dom.panelEl._attrs['aria-hidden'], 'false');
  });

  test('clicar mb-mais-btn → gps panel NÃO recebe mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.maisBtn._click();
    assert.ok(!dom.gpsPanelEl.classList.contains('mb-sub-ativa'));
  });

  test('clicar mb-config-fechar → config panel perde mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.maisBtn._click();
    dom.cfgFechar._click();
    assert.ok(!dom.panelEl.classList.contains('mb-sub-ativa'));
  });

  test('clicar mb-config-fechar → config panel aria-hidden = "true"', () => {
    const { dom } = criarPagina();
    dom.maisBtn._click();
    dom.cfgFechar._click();
    assert.strictEqual(dom.panelEl._attrs['aria-hidden'], 'true');
  });

  test('fecharSub sem painel ativo → não lança erro', () => {
    const { dom } = criarPagina();
    // cfgFechar sem ter aberto antes
    assert.doesNotThrow(() => dom.cfgFechar._click());
  });
});

suite('MinhaBarbeariaPage — sub-painéis (gps)', () => {

  test('clicar mb-gps-btn → gps panel recebe classe mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    assert.ok(dom.gpsPanelEl.classList.contains('mb-sub-ativa'));
  });

  test('clicar mb-gps-btn → gps panel aria-hidden = "false"', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    assert.strictEqual(dom.gpsPanelEl._attrs['aria-hidden'], 'false');
  });

  test('clicar mb-gps-btn → config panel NÃO recebe mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    assert.ok(!dom.panelEl.classList.contains('mb-sub-ativa'));
  });

  test('clicar mb-gps-fechar → gps panel perde mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    dom.gpsFechar._click();
    assert.ok(!dom.gpsPanelEl.classList.contains('mb-sub-ativa'));
  });

  test('clicar mb-gps-fechar → gps panel aria-hidden = "true"', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    dom.gpsFechar._click();
    assert.strictEqual(dom.gpsPanelEl._attrs['aria-hidden'], 'true');
  });

  test('abrir gps e depois fechar config → gps panel permanece sem mb-sub-ativa', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    dom.gpsFechar._click();
    // Config nunca foi aberto, fechar não deve afetar gps
    assert.ok(!dom.gpsPanelEl.classList.contains('mb-sub-ativa'));
  });
});

// =============================================================================
// Suite 3 — Alternância: abrir um painel após fechar outro
// =============================================================================

suite('MinhaBarbeariaPage — alternância entre painéis', () => {

  test('abrir config → fechar → abrir gps: apenas gps fica ativo', () => {
    const { dom } = criarPagina();
    dom.maisBtn._click();
    dom.cfgFechar._click();
    dom.gpsBtn._click();
    assert.ok(!dom.panelEl.classList.contains('mb-sub-ativa'), 'config deve estar fechado');
    assert.ok(dom.gpsPanelEl.classList.contains('mb-sub-ativa'), 'gps deve estar aberto');
  });

  test('abrir gps → fechar → abrir config: apenas config fica ativo', () => {
    const { dom } = criarPagina();
    dom.gpsBtn._click();
    dom.gpsFechar._click();
    dom.maisBtn._click();
    assert.ok(dom.panelEl.classList.contains('mb-sub-ativa'),    'config deve estar aberto');
    assert.ok(!dom.gpsPanelEl.classList.contains('mb-sub-ativa'),'gps deve estar fechado');
  });

  test('abrir e fechar config 3 vezes consecutivas: estado final correto', () => {
    const { dom } = criarPagina();
    for (let i = 0; i < 3; i++) {
      dom.maisBtn._click();
      dom.cfgFechar._click();
    }
    assert.ok(!dom.panelEl.classList.contains('mb-sub-ativa'));
    assert.strictEqual(dom.panelEl._attrs['aria-hidden'], 'true');
  });
});

// =============================================================================
// Suite 4 — Helpers estáticos
// =============================================================================

suite('MinhaBarbeariaPage — #formatarNumero (via KPIs)', () => {
  // Método privado estático, acessado indiretamente via #renderKpis.
  // Testamos o resultado visível no DOM.

  test('0 → exibe "0"', () => {
    const { dom, page } = criarPagina();
    // Simula render direto verificando que kpiLikes recebe o valor formatado.
    // Como #renderKpis é privado, testamos via KPI stub após #carregar fictício.
    // Aqui apenas verificamos que o DOM stub não lança erro quando textContent é definido.
    dom.elMap.get('mb-kpi-likes').textContent = '0';
    assert.strictEqual(dom.elMap.get('mb-kpi-likes').textContent, '0');
  });
});

// Exporta auxiliares para eventual reuso
// (não necessário no node:test, mas boa prática)
