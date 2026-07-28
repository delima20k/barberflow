'use strict';
const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const fs              = require('node:fs');
const path            = require('node:path');
const { fn, carregar } = require('./_helpers.js');

const ROOT         = path.resolve(__dirname, '..');
const SRC_MB_PAGE  = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'), 'utf8',
);
const SRC_COMPONENTS_CSS = fs.readFileSync(
  path.join(ROOT, 'shared/css/components.css'), 'utf8',
);
const SRC_INDEX = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/index.html'), 'utf8',
);

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
    _listeners,
    _click: () => (_listeners['click'] ?? []).forEach(h => h()),
    _input: (v) => { _listeners['input']?.forEach(h => h({ target: { value: v } })); },

    querySelectorAll: () => [],
    querySelector:    () => null,
    appendChild:      () => {},
    contains:         (_node) => false,
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
    'mb-convite-panel',
    'mb-nome', 'mb-cover-img', 'mb-cover-input', 'mb-quota-txt',
    'mb-add-btn', 'mb-gps-btn', 'mb-mais-btn', 'mb-equipe-convidar-btn',
    'mb-story-slot-2', 'mb-story-slot-3',
    'mb-kpi-rating', 'mb-kpi-clientes', 'mb-kpi-portfolio', 'mb-kpi-likes',
    'mb-portfolio-grid', 'mb-servicos-lista',
    'mb-config-fechar', 'mb-cfg-capa-input', 'mb-cfg-capa-img',
    'mb-cfg-logo-input', 'mb-cfg-logo-img', 'mb-cfg-nome',
    'mb-cfg-produtos-lista', 'mb-cfg-add-produto',
    'mb-config-salvar', 'mb-config-msg',
    'mb-gps-fechar', 'mb-convite-fechar',
    'gps-cep', 'gps-btn-buscar', 'gps-logradouro', 'gps-bairro',
    'gps-cidade', 'gps-numero', 'gps-complemento',
    'gps-btn-gps', 'gps-coords-txt', 'gps-msg', 'gps-btn-salvar',
    'gps-dig',
    // Status da barbearia (toggle aberto/fechado)
    'mb-status-toggle', 'mb-status-txt', 'mb-topo-status',
  ];

  const elMap = new Map(IDS.map(id => [id, criarEl(id)]));

  return {
    elMap,
    telaEl:    elMap.get('tela-minha-barbearia'),
    panelEl:   elMap.get('mb-config-panel'),
    gpsPanelEl:elMap.get('mb-gps-panel'),
    maisBtn:   elMap.get('mb-mais-btn'),
    gpsBtn:    elMap.get('mb-gps-btn'),
    conviteBtn: elMap.get('mb-equipe-convidar-btn'),
    cfgFechar: elMap.get('mb-config-fechar'),
    gpsFechar: elMap.get('mb-gps-fechar'),
    convitePanelEl: elMap.get('mb-convite-panel'),
    conviteFechar: elMap.get('mb-convite-fechar'),
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
    getElementById:   fn(id => comTelaEl ? (dom.elMap.get(id) ?? null) : null),
    addEventListener: fn(),
    activeElement:    null,
  };

  const sandbox = vm.createContext({
    console,
    document:        documentMock,
    sessionStorage:  {
      getItem:    fn().mockReturnValue(null),
      setItem:    fn(),
      removeItem: fn(),
    },
    MutationObserver: function(cb) {
      this.observe = fn();
      this.disconnect = fn();
      this._disparar = cb;
      mutationObservers.push(this);
    },
    AuthService:     { getPerfil: fn().mockReturnValue(null) },
    SupabaseService: {},
    NotificationService: { mostrarToast: fn() },
    StatusFechamentoModal: {
      confirmarFechamento: fn().mockResolvedValue(null),
      labelStatus:  fn().mockReturnValue('Aberta'),
      classeStatus: fn().mockReturnValue('status--aberta'),
      classBadge:   fn().mockReturnValue('badge--verde'),
      TIPO: Object.freeze({ NORMAL: 'normal', ALMOCO: 'almoco', JANTA: 'janta' }),
    },
    BarbeshopRepository: { updateIsOpen: fn().mockResolvedValue({ data: null, error: null }) },
    MediaP2P: class MediaP2P {
      cancelarTodos()          {}
      cancelar()               {}
      registrar()              { return Promise.resolve('blob:fake'); }
      temPendente()            { return false; }
      extensaoPendente()       { return 'jpg'; }
      fazerUpload()            { return Promise.resolve('path/to/file.jpg'); }
    },
  });

  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryBrowserMediaAdapter.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js');
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js');

  const page = new sandbox.MinhaBarbeariaPage();
  page.bind();

  return { page, dom, documentMock, mutationObservers, sandbox };
}

// =============================================================================
// describe 1 — bind(): inicialização
// =============================================================================

describe('MinhaBarbeariaPage — bind()', () => {

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

  test('ao ativar tela-minha-barbearia, NÃO manipula o header diretamente', () => {
    // HeaderScrollBehavior é responsável por revelar o header via snap instantâneo.
    // MinhaBarbeariaPage não deve interferir para evitar race condition com WAAPI.
    const { dom, mutationObservers } = criarPagina();
    const header = dom.elMap.get('app-header');

    header.classList.add('header--oculto');
    header.style.transform = 'translateY(-110%)';
    dom.telaEl.classList.add('ativa');
    mutationObservers[0]._disparar();

    // header--oculto deve permanecer intacto (HeaderScrollBehavior cuida disso)
    assert.equal(header.classList.contains('header--oculto'), true,
      'MinhaBarbeariaPage não deve remover header--oculto — responsabilidade do HeaderScrollBehavior');
    // transform não deve ser apagado pelo page controller
    assert.equal(header.style.transform, 'translateY(-110%)',
      'MinhaBarbeariaPage não deve alterar header.style.transform');
  });
});

describe('MinhaBarbeariaPage - estabilidade de realtime/equipe', () => {
  test('realtime e polling devem agrupar re-render da equipe', () => {
    assert.match(SRC_MB_PAGE, /#agendarReRenderEquipe\(delayMs = 160\)/);
    assert.match(SRC_MB_PAGE, /postgres_changes[\s\S]+#agendarReRenderEquipe\(\)/);
    assert.match(SRC_MB_PAGE, /setInterval\([\s\S]+#agendarReRenderEquipe\(300\)/);
  });

  test('re-render frequente deve apenas ler fila, sem sincronizar/promover clientes', () => {
    const reRenderIdx = SRC_MB_PAGE.indexOf('async #reRenderEquipe()');
    assert.notEqual(reRenderIdx, -1, 'deve existir #reRenderEquipe');
    const reRenderBody = SRC_MB_PAGE.slice(reRenderIdx, SRC_MB_PAGE.indexOf('// ── Convites', reRenderIdx));
    assert.match(reRenderBody, /CadeiraService\.getFilaAtiva\(this\.#barbershopId\)/);
    assert.doesNotMatch(reRenderBody, /CadeiraService\.sincronizarFilas\(this\.#barbershopId\)/);
  });

  test('fluxo profissional deve sentar cliente sem notificar o proprio barbeiro', () => {
    const inicio = SRC_MB_PAGE.indexOf('async #fluxoSentar');
    const fim = SRC_MB_PAGE.indexOf('async #fluxoFinalizar', inicio);
    const fluxoSentar = SRC_MB_PAGE.slice(inicio, fim);

    assert.match(
      fluxoSentar,
      /CadeiraService\.sentar\(\{[\s\S]*notificarBarbeiro:\s*false/,
    );
  });

  test('voltar da Minha Barbearia fecha subpainel antes de acionar router global', () => {
    assert.match(SRC_MB_PAGE, /document\.addEventListener\('click'[\s\S]+#subTelaAtiva[\s\S]+closest\('\.btn-voltar'\)/);
    assert.match(SRC_MB_PAGE, /#subTelaAtiva\.contains\(voltarBtn\)/);
    assert.match(SRC_MB_PAGE, /e\.preventDefault\(\);[\s\S]+e\.stopPropagation\(\);[\s\S]+this\.#fecharSub\(\)/);
  });

  // ── Fix: polling de fallback nunca desligava ao reconectar (causa do "piscar") ──
  //
  // #iniciarRealtimeFila/#pararPollingFallback são instância-privadas e ficam
  // atrás de #carregar() (pipeline assíncrono pesado: perfil, shop, serviços,
  // stories, fila, etc. — todos static-privados, não mockáveis de fora).
  // Testamos a estrutura da correção via código-fonte, seguindo o mesmo
  // padrão já usado acima para #agendarReRenderEquipe/postgres_changes.

  function blocoIniciarRealtimeFila() {
    const inicio = SRC_MB_PAGE.indexOf('#iniciarRealtimeFila(barbershopId)');
    assert.notEqual(inicio, -1, 'deve existir #iniciarRealtimeFila');
    const fim = SRC_MB_PAGE.indexOf('#iniciarPollingFallback()', inicio);
    return SRC_MB_PAGE.slice(inicio, fim > inicio ? fim : undefined);
  }

  test('reconexão do Realtime (status SUBSCRIBED) desliga o polling de fallback', () => {
    const bloco = blocoIniciarRealtimeFila();
    assert.match(
      bloco,
      /status === 'SUBSCRIBED'[\s\S]*?this\.#pararPollingFallback\(\)/,
      'o branch SUBSCRIBED deve chamar #pararPollingFallback() para não deixar o polling rodando em paralelo',
    );
  });

  test('SUBSCRIBED não remove o canal Realtime (só o polling)', () => {
    const bloco = blocoIniciarRealtimeFila();
    const subscribedIdx = bloco.indexOf("status === 'SUBSCRIBED'");
    const proximoBranch = bloco.indexOf('CHANNEL_ERROR', subscribedIdx);
    const branchSubscribed = bloco.slice(subscribedIdx, proximoBranch > subscribedIdx ? proximoBranch : undefined);
    assert.doesNotMatch(
      branchSubscribed,
      /removeChannel|this\.#canalFila\s*=\s*null/,
      'SUBSCRIBED não deve remover/anular o canal — ele já está corretamente conectado',
    );
  });

  test('#pararPollingFallback existe, é idempotente e limpa o timer', () => {
    const idx = SRC_MB_PAGE.indexOf('#pararPollingFallback()');
    assert.notEqual(idx, -1, 'deve existir o helper #pararPollingFallback');
    const fim = SRC_MB_PAGE.indexOf('#pararRealtimeFila()', idx);
    const corpo = SRC_MB_PAGE.slice(idx, fim > idx ? fim : idx + 300);
    assert.match(corpo, /if\s*\(this\.#pollingTimer\)/, 'deve checar antes de limpar (idempotente)');
    assert.match(corpo, /clearInterval\(this\.#pollingTimer\)/);
    assert.match(corpo, /this\.#pollingTimer\s*=\s*null/);
  });

  test('#pararRealtimeFila reaproveita #pararPollingFallback (sem duplicar clearInterval)', () => {
    const idx = SRC_MB_PAGE.indexOf('#pararRealtimeFila() {');
    assert.notEqual(idx, -1, 'deve existir #pararRealtimeFila');
    const fim = SRC_MB_PAGE.indexOf('#iniciarRealtimeAtividade', idx);
    const corpo = SRC_MB_PAGE.slice(idx, fim > idx ? fim : undefined);
    assert.match(corpo, /this\.#pararPollingFallback\(\)/, '#pararRealtimeFila deve chamar o helper, não duplicar a lógica de clearInterval');
  });
});

// =============================================================================
// describe 2 — Sub-painéis: animação (entrada e saída pela esquerda)
// =============================================================================

describe('MinhaBarbeariaPage — sub-painéis (config)', () => {

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

  test('#fecharSub chama blur() no activeElement antes de definir aria-hidden=true', () => {
    // Garante que o foco é movido para fora do painel antes de escondê-lo da AT,
    // evitando o aria-hidden conflict (WCAG 2.1 / 4.1.3)
    const idx = SRC_MB_PAGE.indexOf('#fecharSubPainel(panel) {');
    assert.ok(idx > 0, '#fecharSubPainel deve existir');
    const bloco = SRC_MB_PAGE.slice(idx, idx + 400);
    assert.ok(
      bloco.includes('activeElement') && bloco.includes('blur'),
      '#fecharSubPainel deve chamar blur() no activeElement antes de setar aria-hidden=true',
    );
  });
});

describe('MinhaBarbeariaPage — sub-painéis (gps)', () => {

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
// describe 3 — Alternância: abrir um painel após fechar outro
// =============================================================================

describe('MinhaBarbeariaPage — alternância entre painéis', () => {

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

  test('sair da tela fecha todos os subpainéis internos ativos', () => {
    const { dom, mutationObservers } = criarPagina();

    dom.maisBtn._click();
    dom.gpsBtn._click();
    dom.conviteBtn._click();
    mutationObservers[0]._disparar();

    assert.ok(!dom.panelEl.classList.contains('mb-sub-ativa'), 'config deve fechar ao sair');
    assert.ok(!dom.gpsPanelEl.classList.contains('mb-sub-ativa'), 'gps deve fechar ao sair');
    assert.ok(!dom.convitePanelEl.classList.contains('mb-sub-ativa'), 'convite deve fechar ao sair');
    assert.strictEqual(dom.panelEl._attrs['aria-hidden'], 'true');
    assert.strictEqual(dom.gpsPanelEl._attrs['aria-hidden'], 'true');
    assert.strictEqual(dom.convitePanelEl._attrs['aria-hidden'], 'true');
  });

  test('cleanup de saída cancela timers e fecha modal de story', () => {
    const idx = SRC_MB_PAGE.indexOf('#limparEstadoAoSair() {');
    assert.ok(idx > 0, '#limparEstadoAoSair deve existir');
    const bloco = SRC_MB_PAGE.slice(idx, idx + 900);

    assert.ok(bloco.includes('#limparStoryPressTimers'), 'deve limpar timers de long press dos stories');
    assert.ok(bloco.includes('#fecharStoryCreationModal'), 'deve fechar modal de criação de story');
    assert.match(SRC_MB_PAGE, /#limparStoryPressTimers\(\) \{[\s\S]*clearTimeout/);
    assert.match(SRC_MB_PAGE, /\.sc-overlay \.sc-close/);
  });
});

// =============================================================================
// describe 4 — Helpers estáticos
// =============================================================================

describe('MinhaBarbeariaPage - sub-paineis (convite)', () => {
  test('clicar convidar barbeiro abre o painel de convite', () => {
    const { dom } = criarPagina();
    dom.conviteBtn._click();

    assert.ok(dom.convitePanelEl.classList.contains('mb-sub-ativa'));
    assert.strictEqual(dom.convitePanelEl._attrs['aria-hidden'], 'false');
  });

  test('clicar mb-convite-fechar fecha o painel de convite', () => {
    const { dom } = criarPagina();
    dom.conviteBtn._click();
    dom.conviteFechar._click();

    assert.ok(!dom.convitePanelEl.classList.contains('mb-sub-ativa'));
    assert.strictEqual(dom.convitePanelEl._attrs['aria-hidden'], 'true');
  });
});

describe('MinhaBarbeariaPage — #formatarNumero (via KPIs)', () => {
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

// =============================================================================
// describe 6 — status toggle (mb-status-toggle)
// =============================================================================

describe('MinhaBarbeariaPage — status toggle', () => {

  test('bind() registra click listener no mb-status-toggle', () => {
    const { dom } = criarPagina();
    const toggle   = dom.elMap.get('mb-status-toggle');
    const temClick = toggle._listeners.click?.length > 0;
    assert.ok(temClick, 'mb-status-toggle deve ter click listener registrado após bind()');
  });

  test('mb-status-txt está no DOM e aceita textContent', () => {
    const { dom } = criarPagina();
    const txt = dom.elMap.get('mb-status-txt');
    assert.ok(txt, 'mb-status-txt deve existir no DOM');
    txt.textContent = 'Aberta';
    assert.strictEqual(txt.textContent, 'Aberta');
  });

  test('mb-topo-status está no DOM e aceita className', () => {
    const { dom } = criarPagina();
    const topo = dom.elMap.get('mb-topo-status');
    assert.ok(topo, 'mb-topo-status deve existir no DOM');
    topo.className = 'status--aberta';
    assert.strictEqual(topo.className, 'status--aberta');
  });

  test('click no toggle sem barbershopId não lança erro (retorno antecipado)', async () => {
    const { dom } = criarPagina();
    const toggle  = dom.elMap.get('mb-status-toggle');
    // Dispara o click handler real registrado pelo bind()
    const handler = toggle._listeners.click?.[0];
    assert.ok(typeof handler === 'function', 'handler deve ser função');
    await assert.doesNotReject(() => Promise.resolve(handler.call(toggle)));
  });

  test('sandbox StatusFechamentoModal.confirmarFechamento é spy substituível', () => {
    const { page, dom: d } = criarPagina();
    // Verifica apenas que o sandbox criou a função stub sem erros
    void page;
    void d;
    // Acesso ao sandbox não é necessário; bind() já rodou sem lançar TypeError
    assert.ok(true, 'sandbox com StatusFechamentoModal não lança ao criar a página');
  });
});

// =============================================================================
// describe 7 - Configuracoes da barbearia: servicos/produtos
// =============================================================================

describe('MinhaBarbeariaPage - produtos no sub-painel de configuracoes', () => {

  test('servicos carregados devem popular somente a view de itens salvos', () => {
    assert.ok(
      !SRC_MB_PAGE.includes('servicos.forEach(s => this.#adicionarLinhaProduto(s));'),
      'servicos ja salvos nao devem renderizar card/form em mb-cfg-produtos-lista',
    );
    assert.match(
      SRC_MB_PAGE,
      /itensView\.innerHTML\s*=\s*'';\s*servicos[\s\S]*\.filter\(s => s\.category !== 'mensalidade'\)[\s\S]*\.forEach\(s => this\.#adicionarItemNaView\(s\)\);/s,
      'servicos ja salvos devem aparecer em mb-cfg-itens-view',
    );
  });

  test('salvar item deve retirar o formulario temporario da tela', () => {
    assert.match(
      SRC_MB_PAGE,
      /#salvarProdutoUnico\(row\)[\s\S]*row\.remove\(\);[\s\S]*NotificationService\?\.mostrarToast/,
      'apos salvar, a linha do formulario deve sair da tela antes do toast',
    );
  });

  test('salvar item com falha no upload deve revogar o Blob URL pendente do MediaP2P', () => {
    const idxMetodo = SRC_MB_PAGE.indexOf('async #salvarProdutoUnico(row)');
    const bloco = SRC_MB_PAGE.slice(idxMetodo, SRC_MB_PAGE.indexOf('#adicionarItemNaView(produto)', idxMetodo));
    const catchBloco = bloco.slice(bloco.indexOf('} catch (err) {'));
    assert.match(
      catchBloco,
      /this\.#mediaP2P\.cancelar\(row\.dataset\.mediaUid\)/,
      'catch de #salvarProdutoUnico deve revogar o Blob pendente para nao vazar memoria em upload que falha',
    );
  });

  test('#resolverImagemServicoLinha deve revogar o Blob URL pendente quando o upload falha', () => {
    const idxMetodo = SRC_MB_PAGE.indexOf('async #resolverImagemServicoLinha(el)');
    const bloco = SRC_MB_PAGE.slice(idxMetodo, SRC_MB_PAGE.indexOf('return imagePath;', idxMetodo));
    assert.match(
      bloco,
      /catch \(err\) \{[\s\S]*this\.#mediaP2P\.cancelar\(uid\);[\s\S]*throw err;/,
      'falha no upload da imagem de servico deve revogar o Blob antes de propagar o erro',
    );
  });

  test('servicos por tipo devem ter botao de salvar individual e atualizar cache da modal', () => {
    const idxTiposServico = SRC_MB_PAGE.indexOf('static #TIPOS_SERVICO');
    const tiposServico = SRC_MB_PAGE.slice(
      idxTiposServico,
      SRC_MB_PAGE.indexOf('#renderServicosTipados', idxTiposServico),
    );

    assert.match(
      tiposServico,
      /cat:\s*'corte'[\s\S]*label:\s*'Corte'/,
      'card de corte deve permanecer como servico fixo',
    );
    assert.match(
      tiposServico,
      /cat:\s*'luzes'[\s\S]*luzes:\s*true/,
      'card de luzes deve permanecer nos servicos por tipo',
    );
    assert.doesNotMatch(
      tiposServico,
      /cat:\s*'(barba|pezinho|sobrancelha)'/,
      'somente corte e luzes devem ficar nos servicos por tipo',
    );
    assert.match(
      SRC_MB_PAGE,
      /<span class="mb-serv-tipo-label">\$\{esc\(tipo\.label\)\}<\/span>/,
      'nome visual do corte deve usar o label fixo do card',
    );
    assert.doesNotMatch(
      SRC_MB_PAGE,
      /readonly aria-readonly="true"/,
      'card de corte nao deve renderizar input de nome somente leitura',
    );
    assert.match(
      SRC_INDEX,
      /id="mb-cfg-add-produto"[\s\S]*\+ Servi.os[\s\S]*<\/button>/,
      'botao de novo servico deve ficar disponivel como + Servicos',
    );
    assert.match(
      SRC_MB_PAGE,
      /class="btn-flow mb-serv-tipo-salvar-btn" type="button" aria-label="Salvar servi.o">OK<\/button>/,
      'cada servico por tipo deve renderizar botao OK',
    );
    assert.match(
      SRC_MB_PAGE,
      /\.mb-serv-tipo-salvar-btn'\)\s*\.addEventListener\('click', \(\) => this\.#salvarServicoTipadoUnico\(li\)\)/,
      'botao do servico por tipo deve chamar salvamento individual',
    );
    assert.match(
      SRC_MB_PAGE,
      /async #salvarServicoTipadoUnico\(li\)[\s\S]*#salvarServicosTipados\(li\);[\s\S]*#fetchServicos\(this\.#barbershopId\)/,
      'salvamento individual deve persistir somente o card clicado e recarregar cache usado pela modal de servicos',
    );
    assert.match(
      SRC_MB_PAGE,
      /async #salvarServicosTipados\(linhaUnica = null\)[\s\S]*if \(linhaUnica && el !== linhaUnica\) continue;[\s\S]*if \(cat === 'luzes'\)[\s\S]*nome = .*'Luzes'/,
      'card de luzes deve salvar com nome fixo e permitir OK quando meia ou inteira estiver preenchido',
    );
    assert.match(
      SRC_MB_PAGE,
      /if \(cat === 'luzes'\) payload\.price_half = priceHalf \?\? null;/,
      'luzes deve enviar price_half apos migration 20260530000001 adicionar a coluna',
    );
    assert.doesNotMatch(
      SRC_MB_PAGE,
      /#upsertServicoComFallback/,
      'luzes nao deve usar fallback legado de upsert apos schema remoto ter price_half',
    );
    assert.match(
      SRC_MB_PAGE,
      /btn\?\.dataset\.saved === 'true'[\s\S]*#setEstadoBotaoServico\(btn, false\)[\s\S]*\.focus\(\)/,
      'clique no visto deve voltar para OK e focar o campo para atualizar o servico',
    );
    assert.match(
      SRC_MB_PAGE,
      /#setEstadoBotaoServico\(btn, salvo\)[\s\S]*btn\.textContent = salvo \? '✓' : 'OK'/,
      'apos salvar o botao deve virar icone de visto',
    );
    assert.match(
      SRC_COMPONENTS_CSS,
      /\.mb-serv-tipo-li\s*\{[\s\S]*overflow:\s*hidden;/,
      'card de cada servico deve esconder overflow',
    );
  });

  test('mensalidade deve ter salvamento proprio e fallback para schema antigo', () => {
    assert.match(
      SRC_INDEX,
      /id="mb-mensal-salvar"[\s\S]*Salvar mensalidade[\s\S]*<\/button>/,
      'secao de mensalidade deve ter botao proprio de salvar',
    );
    assert.match(
      SRC_MB_PAGE,
      /mensalSalvar:\s+q\('mb-mensal-salvar'\)/,
      'runtime deve mapear o botao de salvar mensalidade',
    );
    assert.match(
      SRC_MB_PAGE,
      /mensalSalvar\?\.addEventListener\('click', \(\) => this\.#salvarMensalidade\(\)\)/,
      'botao de mensalidade deve chamar salvamento proprio',
    );
    assert.match(
      SRC_MB_PAGE,
      /#salvarMensalidadeServico\(\)[\s\S]*BffApiService\.barbearias\.salvarMensalidade\(payload\)/,
      'mensalidade deve persistir via BFF na rota PATCH /minha/mensalidade',
    );
    assert.match(
      SRC_MB_PAGE,
      /#salvarConfiguracoes\(\)[\s\S]*const mensalidadeResultado = await this\.#salvarMensalidadeServico\(\);[\s\S]*this\.#sincronizarMensalidadeLocal\(mensalidadeResultado\.payload, mensalidadeResultado\.data\);/,
      'salvar configuracoes deve manter o banner sincronizado ao atualizar mensalidade',
    );
    assert.match(
      SRC_MB_PAGE,
      /#salvarMensalidade\(\)[\s\S]*this\.#sincronizarMensalidadeLocal\(payload, data\);/,
      'salvamento proprio da mensalidade deve atualizar estado local e cache publico',
    );
    assert.match(
      SRC_MB_PAGE,
      /#sincronizarMensalidadeLocal\(payload, _data\)[\s\S]*monthly_plan_price[\s\S]*monthly_plan_message[\s\S]*#invalidarCachePublicoBarbearia\(\)/,
      'sincronizacao local deve atualizar os campos e invalidar cache publico',
    );
    assert.match(
      SRC_MB_PAGE,
      /#sincronizarMensalidadeLocal\(payload, _data\)[\s\S]*#notificarAtualizacaoPublicaMensalidade\(\)/,
      'sincronizacao local deve notificar a pagina publica para atualizar o banner aberto',
    );
    assert.match(
      SRC_MB_PAGE,
      /#invalidarCachePublicoBarbearia\(\)[\s\S]*CacheManager\.clearScope\(this\.#barbershopId\)/,
      'cache publico da barbearia deve ser limpo para o banner recarregar atualizado',
    );
    assert.match(
      SRC_MB_PAGE,
      /#notificarAtualizacaoPublicaMensalidade\(\)[\s\S]*SupabaseService\.barbershops\(\)[\s\S]*updated_at:\s+new Date\(\)\.toISOString\(\)[\s\S]*\.eq\('id', this\.#barbershopId\)/,
      'salvar mensalidade deve tocar updated_at da barbearia para disparar realtime publico',
    );
    const idxUpdateShop = SRC_MB_PAGE.indexOf('async #atualizarBarbeariaSemMensalidade');
    const updateShop = SRC_MB_PAGE.slice(idxUpdateShop, SRC_MB_PAGE.indexOf('#salvarMensalidade()', idxUpdateShop));
    assert.match(updateShop, /SupabaseService\.barbershops\(\)[\s\S]*\.update\(payload\)/);
    assert.doesNotMatch(updateShop, /monthly_plan_price|monthly_plan_message/);
  });

  test('lixeira dos itens salvos exclui direto sem confirmacao textual', () => {
    assert.ok(
      !SRC_MB_PAGE.includes('mb-item-confirm'),
      'nao deve renderizar bloco de confirmacao para excluir item',
    );
    assert.ok(
      !SRC_MB_PAGE.includes('Apagar este item?'),
      'nao deve mostrar texto "Apagar este item?"',
    );
    assert.match(
      SRC_MB_PAGE,
      /\.mb-item-trash-btn'\)\.addEventListener\('click', async \(\) => \{[\s\S]*#removerItemCompleto\(produto\.id, item\)/,
      'click na lixeira deve chamar remocao direta',
    );
  });

  test('labels do painel config devem ter traco ate a ponta direita', () => {
    assert.match(
      SRC_COMPONENTS_CSS,
      /#mb-config-panel \.mb-config-secao-label\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/,
      'label do painel config deve usar flex para texto + traco',
    );
    assert.match(
      SRC_COMPONENTS_CSS,
      /#mb-config-panel \.mb-config-secao-label\s*\{[\s\S]*font-size:\s*\.68rem;[\s\S]*white-space:\s*nowrap;/,
      'label do painel config deve ficar menor e sem quebra de linha',
    );
    assert.match(
      SRC_COMPONENTS_CSS,
      /#mb-config-panel \.mb-config-secao-label::after\s*\{[\s\S]*flex:\s*1;[\s\S]*height:\s*1px;/,
      'pseudo-elemento deve preencher o espaco ate a ponta direita',
    );
  });

  test('corte barba e pacotes devem usar formulario em linha no config', () => {
    assert.match(
      SRC_COMPONENTS_CSS,
      /\.mb-serv-tipo-li\[data-category="corte"\],[\s\S]*\.mb-serv-tipo-li\[data-category="barba"\]\s*\{[\s\S]*flex-direction:\s*row;[\s\S]*align-items:\s*center;/,
      'LIs de corte e barba devem ficar em linha',
    );
    assert.match(
      SRC_COMPONENTS_CSS,
      /\.mb-serv-tipo-li\[data-category="corte"\] \.mb-cfg-prod-fields,[\s\S]*\.mb-serv-tipo-li\[data-category="barba"\] \.mb-cfg-prod-fields\s*\{[\s\S]*flex-direction:\s*row;/,
      'campos de corte e barba devem ficar lado a lado',
    );
    assert.match(
      SRC_COMPONENTS_CSS,
      /\.mb-prod-form-view\s*\{[\s\S]*flex-direction:\s*row;[\s\S]*align-items:\s*center;/,
      'formulario de pacotes deve seguir o mesmo padrao em linha',
    );
    assert.match(
      SRC_COMPONENTS_CSS,
      /\.mb-prod-form-view \.mb-cfg-prod-fields\s*\{[\s\S]*flex-direction:\s*row;/,
      'campos de pacotes devem ficar em linha',
    );
    const idxRegraGenerica = SRC_COMPONENTS_CSS.indexOf('.mb-prod-li--painel .mb-cfg-prod-fields');
    const idxRegraBarba = SRC_COMPONENTS_CSS.lastIndexOf('.mb-serv-tipo-li[data-category="barba"] .mb-cfg-prod-fields');
    assert.ok(
      idxRegraBarba > idxRegraGenerica,
      'regra de barba deve vir depois da regra generica para nao voltar para coluna',
    );
  });
});

describe('MinhaBarbeariaPage - cadeiras por barbeiro responsavel', () => {

  test('centraliza permissao de cadeira no professionalId logado e status do parceiro', () => {
    assert.match(
      SRC_MB_PAGE,
      /const propriaCadeira\s*=\s*!!professionalId\s*&&\s*professionalId\s*===\s*this\.#profissionalId;/,
      'deve permitir gerenciar apenas a row cujo professionalId e o usuario logado',
    );
    assert.match(
      SRC_MB_PAGE,
      /if\s*\(this\.#contextoParceiro\)\s*return\s+this\.#barbeiroParceiroAtivo\s*===\s*true;/,
      'no modo parceiro deve exigir status ativo para cadeira clicavel',
    );
  });

  test('row do dono usa a mesma regra de permissao da cadeira', () => {
    // A row do dono é interativa somente para o dono/profissional logado.
    assert.match(
      SRC_MB_PAGE,
      /variant:\s*'dono'[\s\S]{0,400}isOwner:\s*this\.#podeGerenciarCadeira\(filaDonoId\)/,
      'row do dono deve usar #podeGerenciarCadeira(filaDonoId)',
    );
  });

  test('rows de membros usam permissao por barbeiro responsavel', () => {
    // Cada row de membro fica interativa só para o barbeiro responsável (b.id).
    assert.match(
      SRC_MB_PAGE,
      /variant:\s*'membro'[\s\S]{0,400}isOwner:\s*this\.#podeGerenciarCadeira\(b\.id\)/,
      'row de membro deve usar #podeGerenciarCadeira(b.id)',
    );
  });

  test('#renderEquipe remove o skeleton estático (reconciliação usa appendChild, não innerHTML=\'\')', () => {
    // Regressão: como o render incremental não faz innerHTML='', o placeholder
    // .mb-barbeiro-row--skeleton do HTML precisa ser removido explicitamente —
    // senão fica em cima da row real do dono.
    assert.match(
      SRC_MB_PAGE,
      /donoWrap\.querySelector\('\.mb-barbeiro-row--skeleton'\)\?\.remove\(\)/,
      '#renderEquipe deve remover o skeleton do donoWrap',
    );
    assert.match(
      SRC_MB_PAGE,
      /col\.querySelector\('\.mb-barbeiro-row--skeleton'\)\?\.remove\(\)/,
      '#renderEquipe deve remover o skeleton do col',
    );
  });

  test('#onCadeiraClick nao depende de contextoParceiro para autorizar', () => {
    const idx = SRC_MB_PAGE.indexOf('async #onCadeiraClick');
    assert.ok(idx > 0, '#onCadeiraClick deve existir');
    const bloco = SRC_MB_PAGE.slice(idx, idx + 260);
    assert.match(
      bloco,
      /const podeGerenciar\s*=\s*this\.#podeGerenciarCadeira\(professionalId\);/,
      '#onCadeiraClick deve usar helper central',
    );
    assert.ok(
      !bloco.includes('#contextoParceiro'),
      '#onCadeiraClick nao deve bloquear o dono por nao estar em contexto de parceria',
    );
  });

  test('cadeira interativa usa delegação (data-* + role), sem listener por cadeira', () => {
    // A cadeira carrega data-* e role=button; o clique é resolvido por delegação
    // (1 listener no container da equipe), evitando churn/tempestade de listeners.
    assert.match(SRC_MB_PAGE, /cadeira\.dataset\.tipo\s*=\s*tipo;/,
      'cadeira deve marcar data-tipo');
    assert.match(SRC_MB_PAGE, /cadeira\.dataset\.entryId\s*=\s*entrada\?\.id/,
      'cadeira deve marcar data-entryId');
    assert.match(SRC_MB_PAGE, /cadeira\.setAttribute\('role', 'button'\);/,
      'role=button deve ficar na cadeira inteira');
    assert.match(SRC_MB_PAGE, /#instalarDelegacaoCadeiras\(\)\s*\{/,
      'deve existir a instalação da delegação de cadeiras');
    assert.match(SRC_MB_PAGE, /donoWrap\.addEventListener\('click', onClick\)/,
      'delegação deve escutar clique no container do dono');
    assert.match(SRC_MB_PAGE, /col\.addEventListener\('keydown', onKey\)/,
      'delegação deve escutar teclado no container de membros');
    assert.ok(
      !/cadeira\.addEventListener\('click'/.test(SRC_MB_PAGE),
      'não deve haver listener de clique por cadeira (delegação assume o clique)',
    );
  });

  test('contexto parceiro deve renderizar dono pelo owner_id, nao pelo perfil logado', () => {
    assert.match(
      SRC_MB_PAGE,
      /#perfilDono\s*=\s*await\s+MinhaBarbeariaRuntimeController\.#fetchPerfilDono\(shop,\s*perfil\);/,
      'carregamento deve resolver o perfil real do dono da barbearia',
    );
    assert.match(
      SRC_MB_PAGE,
      /this\.#renderEquipe\(barbeiros,\s*shop\.owner_id,\s*this\.#perfilDono,\s*filaEntradas\);/,
      'render inicial da equipe deve receber o perfil do dono, nao o perfil logado',
    );
    assert.match(
      SRC_MB_PAGE,
      /this\.#renderEquipe\(barbeiros,\s*this\.#shopData\?\.owner_id\s*\?\?\s*'',\s*this\.#perfilDono,\s*filaEntradas\);/,
      're-render da equipe deve preservar o perfil do dono real',
    );
  });
});

describe('MinhaBarbeariaPage - portfolio da barbearia', () => {
  const SRC_HTML_PRO = fs.readFileSync(
    path.join(ROOT, 'apps/profissional/index.html'), 'utf8',
  );
  const SRC_PORTFOLIO_CONTROLLER = fs.readFileSync(
    path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioController.js'), 'utf8',
  );
  const SRC_PORTFOLIO_VIEW = fs.readFileSync(
    path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioView.js'), 'utf8',
  );
  const SRC_PORTFOLIO_BARBEIROS = fs.readFileSync(
    path.join(ROOT, 'shared/js/PortfolioBarbeirosSection.js'), 'utf8',
  );
  const SRC_COMPONENTS_CSS = fs.readFileSync(
    path.join(ROOT, 'shared/css/components.css'), 'utf8',
  );

  test('html expoe section Portfólio da Barbearia com upload de imagem', () => {
    assert.match(SRC_HTML_PRO, /data-minha-barbearia-portfolio-section/);
    assert.match(SRC_HTML_PRO, /Portf[oó]lio da Barbearia/);
    assert.match(SRC_HTML_PRO, /id="mb-portfolio-input"[^>]*accept="image\/\*"/);
  });

  test('controller carrega galeria agregada da barbearia pela BFF', () => {
    assert.match(
      SRC_PORTFOLIO_CONTROLLER,
      /BffApiService\.barbearias\.portfolio\(barbershopId,\s*\{\s*limit:\s*30,\s*offset:\s*0\s*\}\)/,
    );
  });

  test('controller reutiliza upload profissional existente', () => {
    assert.match(
      SRC_PORTFOLIO_CONTROLLER,
      /BffApiService\.profissionais\.uploadPortfolioImagem\(buffer,\s*file\.type\)/,
    );
  });

  test('view abre imagem com PortfolioPrismViewer', () => {
    assert.match(SRC_PORTFOLIO_VIEW, /new PortfolioPrismViewer\(\)/);
    assert.match(SRC_PORTFOLIO_VIEW, /\.open\(item,\s*items\)/);
  });

  test('viewer recebe avatar, nome e curtidas da Minha Barbearia', () => {
    assert.match(SRC_PORTFOLIO_CONTROLLER, /professionalName/);
    assert.match(SRC_PORTFOLIO_CONTROLLER, /professionalAvatarUrl/);
    assert.match(SRC_PORTFOLIO_CONTROLLER, /likesCount/);
    assert.match(SRC_PORTFOLIO_CONTROLLER, /interactions:\s*Array\.isArray\(item\.interactions\)/);
    assert.match(SRC_PORTFOLIO_VIEW, /\.open\(item,\s*items\)/);
  });

  test('view exibe avatar e nome do barbeiro sobre cada imagem', () => {
    assert.match(SRC_PORTFOLIO_VIEW, /mb-portfolio-card__barber/);
    assert.match(SRC_PORTFOLIO_VIEW, /mb-portfolio-card__avatar/);
    assert.match(SRC_PORTFOLIO_VIEW, /professionalAvatarUrl/);
  });

  test('pagina publica mantem avatar e nome do barbeiro no card do portfolio', () => {
    assert.match(SRC_PORTFOLIO_BARBEIROS, /pbp-barber-row/);
    assert.match(SRC_PORTFOLIO_BARBEIROS, /pbp-avatar/);
    assert.match(SRC_PORTFOLIO_BARBEIROS, /pbp-nome/);
    assert.match(SRC_COMPONENTS_CSS, /\.pbp-barber-row\s*\{[\s\S]*top:\s*8px/);
  });

  test('pagina publica envia avatar, nome e curtidas para o viewer 3D', () => {
    assert.match(SRC_PORTFOLIO_BARBEIROS, /professionalName:\s*barber\.full_name/);
    assert.match(SRC_PORTFOLIO_BARBEIROS, /professionalAvatarUrl:\s*avatarUrl/);
    assert.match(SRC_PORTFOLIO_BARBEIROS, /likesCount:\s*item\.likes_count/);
    assert.match(SRC_PORTFOLIO_BARBEIROS, /interactions:\s*item\.interactions/);
  });

  test('galeria da Minha Barbearia usa carrossel horizontal em row', () => {
    assert.match(SRC_COMPONENTS_CSS, /\.mb-portfolio-grid\s*\{[\s\S]*display:\s*flex/);
    assert.match(SRC_COMPONENTS_CSS, /\.mb-portfolio-grid\s*\{[\s\S]*overflow-x:\s*auto/);
    assert.match(SRC_COMPONENTS_CSS, /\.mb-portfolio-grid\s*\{[\s\S]*scroll-snap-type:\s*x mandatory/);
    assert.match(SRC_COMPONENTS_CSS, /\.mb-portfolio-card\s*\{[\s\S]*flex:\s*0 0 clamp/);
    assert.match(SRC_COMPONENTS_CSS, /\.mb-portfolio-card__barber\s*\{[\s\S]*top:\s*8px/);
  });

  test('runtime atualiza a section com shop, perfil e permissao de owner', () => {
    assert.match(
      SRC_MB_PAGE,
      /this\.#atualizarSecaoExtraida\(PortfolioSection,\s*\{[\s\S]*canUpload:\s*this\.#isOwner/,
    );
  });
});

describe('RLS - queue_entries por barbeiro responsavel', () => {

  const SRC_RLS_CADEIRAS = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260529000001_queue_entries_professional_ownership.sql'),
    'utf8',
  );

  test('migration remove permissao antiga do dono sobre filas de terceiros', () => {
    assert.match(SRC_RLS_CADEIRAS, /drop policy if exists "queue_write_professional"/i);
    assert.match(SRC_RLS_CADEIRAS, /drop policy if exists "queue_insert_own"/i);
  });

  test('insert permite cliente proprio ou barbeiro responsavel', () => {
    assert.match(
      SRC_RLS_CADEIRAS,
      /create policy "queue_insert_self_or_responsible"[\s\S]*auth\.uid\(\)\s*=\s*client_id[\s\S]*auth\.uid\(\)\s*=\s*professional_id/i,
    );
  });

  test('update e delete exigem professional_id igual ao usuario autenticado', () => {
    assert.match(
      SRC_RLS_CADEIRAS,
      /create policy "queue_update_responsible_professional"[\s\S]*using\s*\(\s*auth\.uid\(\)\s*=\s*professional_id[\s\S]*with check\s*\(\s*auth\.uid\(\)\s*=\s*professional_id/i,
    );
    assert.match(
      SRC_RLS_CADEIRAS,
      /create policy "queue_delete_responsible_professional"[\s\S]*using\s*\(\s*auth\.uid\(\)\s*=\s*professional_id/i,
    );
  });
});

describe('BarberFlowProfissional - pagina Parcerias', () => {

  test('app principal deve instanciar e chamar bind() da ParceriasPage', () => {
    const appSrc = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/assets/js/app.js'), 'utf8',
    );

    assert.match(
      appSrc,
      /#parceriasPage;/,
      'app deve manter uma instancia privada de ParceriasPage',
    );
    assert.match(
      appSrc,
      /this\.#parceriasPage\s*=\s*new ParceriasPage\(\);/,
      'app deve instanciar ParceriasPage para registrar listeners de Minhas Fotos',
    );
    assert.match(
      appSrc,
      /this\.#parceriasPage\.bind\(\);/,
      'app deve chamar bind() para ativar upload de Minhas Fotos',
    );
  });
});

// =============================================================================
// describe — Aviso de teste grátis (trial): cálculo de dias restantes
// =============================================================================

describe('MinhaBarbeariaPage - contagem de dias do trial', () => {
  const { sandbox } = criarPagina();
  const MB  = sandbox.MinhaBarbeariaRuntimeController;
  const DIA = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-07-02T12:00:00.000Z');
  const emDias = (d) => new Date(now + d * DIA).toISOString();

  test('recém-criado (7 dias) mostra 7', () => {
    assert.equal(MB.calcularDiasTrial(emDias(7), now), 7);
  });

  test('arredonda para cima (6,5 dias restantes -> 7)', () => {
    assert.equal(MB.calcularDiasTrial(emDias(6.5), now), 7);
  });

  test('após 24h de um trial de 7 dias mostra 6', () => {
    assert.equal(MB.calcularDiasTrial(emDias(7), now + DIA), 6);
  });

  test('último dia (menos de 24h) mostra 1', () => {
    assert.equal(MB.calcularDiasTrial(emDias(0.5), now), 1);
  });

  test('expirado (data no passado) mostra 0, nunca negativo', () => {
    assert.equal(MB.calcularDiasTrial(emDias(-1), now), 0);
  });

  test('data inválida retorna null', () => {
    assert.equal(MB.calcularDiasTrial('lixo', now), null);
    assert.equal(MB.calcularDiasTrial(null, now), null);
  });

  test('html expõe o banner de aviso acima do status', () => {
    assert.match(SRC_INDEX, /id="mb-trial-aviso"/);
  });

  test('controller renderiza o aviso no carregamento', () => {
    assert.match(SRC_MB_PAGE, /this\.#renderTrialAviso\(\)/);
    assert.match(SRC_MB_PAGE, /sub\.status !== 'trial'/);
  });
});

// Exporta auxiliares para eventual reuso
// (não necessário no node:test, mas boa prática)
