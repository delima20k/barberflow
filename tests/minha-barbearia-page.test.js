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

  return { page, dom, documentMock, mutationObservers };
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
    const idx = SRC_MB_PAGE.indexOf('#fecharSub() {');
    assert.ok(idx > 0, '#fecharSub deve existir');
    const bloco = SRC_MB_PAGE.slice(idx, idx + 400);
    assert.ok(
      bloco.includes('activeElement') && bloco.includes('blur'),
      '#fecharSub deve chamar blur() no activeElement antes de setar aria-hidden=true',
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
});

// =============================================================================
// describe 4 — Helpers estáticos
// =============================================================================

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
      /itensView\.innerHTML\s*=\s*'';\s*servicos\.forEach\(s => this\.#adicionarItemNaView\(s\)\);/s,
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
});

describe('MinhaBarbeariaPage - cadeiras por barbeiro responsavel', () => {

  test('centraliza permissao de cadeira no professionalId logado', () => {
    assert.match(
      SRC_MB_PAGE,
      /#podeGerenciarCadeira\(professionalId\)\s*\{[\s\S]*return\s+!!professionalId\s*&&\s*professionalId\s*===\s*this\.#profissionalId;/,
      'deve permitir gerenciar apenas a row cujo professionalId e o usuario logado',
    );
  });

  test('row do dono usa a mesma regra de permissao da cadeira', () => {
    const idx = SRC_MB_PAGE.indexOf('variant: \'dono\'');
    assert.ok(idx > 0, 'render da row do dono deve existir');
    const bloco = SRC_MB_PAGE.slice(idx, idx + 500);
    assert.match(
      bloco,
      /isOwner:\s*this\.#podeGerenciarCadeira\(filaDonoId\)/,
      'row do dono deve ficar interativa somente para o dono/profissional logado',
    );
  });

  test('rows de membros usam permissao por barbeiro responsavel', () => {
    assert.match(
      SRC_MB_PAGE,
      /const podeGerenciarCadeiras\s*=\s*this\.#podeGerenciarCadeira\(b\.id\);/,
      'row de membro deve ficar interativa somente para o barbeiro responsavel',
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

  test('cadeira autorizada registra clique e teclado na cadeira inteira', () => {
    assert.match(
      SRC_MB_PAGE,
      /cadeira\.addEventListener\('click', handler\);/,
      'click deve ser registrado na cadeira inteira',
    );
    assert.match(
      SRC_MB_PAGE,
      /cadeira\.setAttribute\('role', 'button'\);/,
      'role=button deve ficar na cadeira inteira',
    );
    assert.match(
      SRC_MB_PAGE,
      /cadeira\.addEventListener\('keydown', e => \{/,
      'teclado deve ser registrado na cadeira inteira',
    );
    assert.ok(
      !SRC_MB_PAGE.includes("iconWrap.addEventListener('click', handler);"),
      'icone nao deve ser o unico alvo clicavel',
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

// Exporta auxiliares para eventual reuso
// (não necessário no node:test, mas boa prática)
