'use strict';

// =============================================================
// notificacao-cadeira-producao.test.js
//
// TDD — cobre os 4 bugs do fluxo de notificação da cadeira de
// produção (client_at_shop).
//
// Bug 3: NotificationService.#normalizarTipo devolve SISTEMA
//         para client_at_shop em vez de AGENDAMENTO.
// Bug 4: AppBootstrap.#processarPushDeepLink não navega para
//         minha-barbearia antes de despachar barberflow:push-show-modal.
// Bug 1: MinhaBarbeariaPage.#onClienteAusente descarta a notificação
//         quando #barbershopId é null e barbershop_id é um UUID real.
// Bug 2: #handlePushShowModal não navega para minha-barbearia ao
//         enfileirar um push pendente (#barbershopId null).
// =============================================================

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { fn, carregar } = require('./_helpers.js');

const BARBERSHOP_ID   = 'aaaa0000-0000-4000-8000-000000000001';
const ENTRY_ID        = 'cccc0000-0000-4000-8000-000000000003';
const PROFISSIONAL_ID = 'bbbb0000-0000-4000-8000-000000000002';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function criarMockEl() {
  return {
    id: '',
    setAttribute: fn(),
    getAttribute: () => null,
    hidden: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    checked: false,
    value: '',
    files: null,
    src: '',
    isConnected: true,
    classList: { add: fn(), remove: fn(), contains: () => false },
    addEventListener: fn(),
    querySelector: () => null,
    querySelectorAll: () => [],
    remove: fn(),
  };
}

function criarMockDocument() {
  const _listeners = {};
  const doc = {
    getElementById: (id) => id === 'tela-minha-barbearia' ? criarMockEl() : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => criarMockEl(),
    body: { appendChild: fn() },
    addEventListener: fn().mockImplementation((evt, handler) => {
      _listeners[evt] = _listeners[evt] ?? [];
      _listeners[evt].push(handler);
    }),
    dispatchEvent: fn().mockImplementation((e) => {
      (_listeners[e.type] ?? []).forEach(h => h(e));
    }),
    _listeners,
  };
  return doc;
}

// ─── Suite 1: NotificationService — normalização de tipo ─────────────────────

suite('NotificationService — client_at_shop normalizado como AGENDAMENTO', () => {

  /** Cria um elemento de toast com querySelector funcional para os botões internos. */
  function criarMockToast() {
    const mockBtn = { addEventListener: fn(), style: {}, classList: { add: fn(), remove: fn(), contains: () => false } };
    return {
      className:    '',
      setAttribute: fn(),
      getAttribute: () => null,
      hidden:       false,
      textContent:  '',
      innerHTML:    '',
      style:        { cursor: '' },
      offsetWidth:  0,
      isConnected:  true,
      classList:    { add: fn(), remove: fn(), contains: () => false },
      addEventListener: fn(),
      querySelector:    () => mockBtn,
      querySelectorAll: () => [mockBtn],
      appendChild:      fn(),
      remove:           fn(),
    };
  }

  function criarSandbox() {
    let _onInsert = null;
    const channel = {
      on: (_ev, _filter, cb) => { _onInsert = cb; return channel; },
      subscribe: fn(),
    };

    const dispatchedEvents = [];
    const _listeners = {};
    const mockContainer = { ...criarMockToast(), appendChild: fn() };

    const sandbox = vm.createContext({
      document: {
        getElementById: () => mockContainer,
        createElement:  () => criarMockToast(),
        body: { appendChild: fn() },
        addEventListener: (evt, handler) => {
          _listeners[evt] = _listeners[evt] ?? [];
          _listeners[evt].push(handler);
        },
        dispatchEvent: (e) => {
          dispatchedEvents.push(e);
          (_listeners[e.type] ?? []).forEach(h => h(e));
        },
      },
      CustomEvent: class {
        constructor(type, opts = {}) {
          this.type   = type;
          this.detail = opts.detail ?? {};
        }
      },
      localStorage: { getItem: () => null, setItem: fn(), removeItem: fn() },
      SupabaseService: {
        channel:       () => channel,
        getSession:    fn().mockResolvedValue(null),
        removeChannel: fn(),
      },
      LoggerService: { warn: fn(), error: fn() },
      clearTimeout: fn(),
      setTimeout:   fn(),
    });

    carregar(sandbox, 'shared/js/NotificationService.js');

    return { sandbox, getOnInsert: () => _onInsert, dispatchedEvents };
  }

  test('retorna tipo agendamento quando type = client_at_shop', () => {
    const { sandbox, getOnInsert, dispatchedEvents } = criarSandbox();

    sandbox.NotificationService.iniciarRealtime('user-1');
    const onInsert = getOnInsert();
    assert.ok(onInsert, 'callback Realtime deve ter sido registrada');

    onInsert({
      new: {
        id:         'notif-1',
        type:       'client_at_shop',
        title:      'Cliente chegou',
        body:       'O cliente está na barbearia.',
        data:       { tipo_acao: 'client_at_shop', barbershop_id: BARBERSHOP_ID, entry_id: ENTRY_ID },
        is_read:    false,
        created_at: new Date().toISOString(),
      },
    });

    const evt = dispatchedEvents.find(e => e.type === 'barberflow:notificacao-nova');
    assert.ok(evt, 'evento barberflow:notificacao-nova deve ser disparado');
    assert.equal(
      evt.detail.notif.tipo,
      'agendamento',
      'client_at_shop deve ser normalizado como AGENDAMENTO, não SISTEMA',
    );
  });
});

// ─── Suite 2: AppBootstrap — deep link navega para minha-barbearia ─────────────

suite('AppBootstrap — deep link push_type navega para minha-barbearia', () => {

  function criarSandbox(search = '') {
    const navSpy = fn();
    const dispatchedEvents = [];
    const _listeners = {};

    const widgetNoop = {
      init:              fn(),
      initHomeCards:     fn(),
      initHomeDestaque:  fn(),
      initHomeBarbeiros: fn(),
      initHomeTodas:     fn(),
    };

    const sandbox = vm.createContext({
      location:           { search, href: 'http://localhost/profissional/' + search, reload: fn() },
      Pro:                { nav: navSpy },
      LoggerService:      { warn: fn(), error: fn() },
      URLSearchParams,
      decodeURIComponent,

      navigator: {
        serviceWorker: {
          addEventListener: fn(),
          register: fn().mockResolvedValue({ waiting: null, addEventListener: fn() }),
          controller: null,
        },
      },

      sessionStorage: { getItem: () => null, setItem: fn(), removeItem: fn() },
      window:         { addEventListener: fn() },

      document: {
        getElementById: () => null,
        createElement:  () => criarMockEl(),
        body:           { appendChild: fn() },
        addEventListener: (evt, handler) => {
          _listeners[evt] = _listeners[evt] ?? [];
          _listeners[evt].push(handler);
        },
        dispatchEvent: (e) => {
          dispatchedEvents.push(e);
          (_listeners[e.type] ?? []).forEach(h => h(e));
        },
        querySelector: () => null,
      },

      CustomEvent: class {
        constructor(type, opts = {}) {
          this.type   = type;
          this.detail = opts.detail ?? {};
        }
      },

      // Widget mocks
      ProfissionalStartupSplash: widgetNoop,
      ProLandingGate:            widgetNoop,
      PWAInstallBanner:          { ...widgetNoop, iconSrc: '', nomeApp: '' },
      MapPanel:                  widgetNoop,
      FooterScrollManager:       widgetNoop,
      HeaderScrollBehavior:      widgetNoop,
      MapWidget:                 widgetNoop,
      GeoService:                { solicitarNaPrimeiraVez: fn() },
      MapOrientationModule:      widgetNoop,
      MessagesWidget:            { init: fn() },
      NotificationService:       { init: fn(), solicitarPushPermissao: fn() },
      PushSubscriptionService:   { init: fn().mockResolvedValue(null), revogar: fn().mockResolvedValue(null) },
      NearbyBarbershopsWidget:   widgetNoop,
      AppState:                  { get: () => false, getUserId: () => null, onAuth: fn() },
      Notification:              { permission: 'granted' },
    });

    carregar(sandbox, 'apps/profissional/assets/js/AppBootstrap.js');

    return { sandbox, navSpy, dispatchedEvents };
  }

  test('navega para minha-barbearia antes de disparar push-show-modal', () => {
    const search = `?push_type=client_at_shop&push_entry=${ENTRY_ID}&push_shop=${BARBERSHOP_ID}&push_nome=Jo%C3%A3o`;
    const { sandbox, navSpy, dispatchedEvents } = criarSandbox(search);

    sandbox.AppBootstrap.init();

    assert.equal(navSpy.calls.length, 1, 'Pro.nav deve ser chamado exatamente uma vez');
    assert.equal(navSpy.calls[0][0], 'minha-barbearia', 'deve navegar para minha-barbearia');

    const evt = dispatchedEvents.find(e => e.type === 'barberflow:push-show-modal');
    assert.ok(evt, 'evento barberflow:push-show-modal deve ser disparado');
    assert.equal(evt.detail.pushType,   'client_at_shop');
    assert.equal(evt.detail.entradaId,  ENTRY_ID);
    assert.equal(evt.detail.barbershopId, BARBERSHOP_ID);
    assert.equal(evt.detail.clienteNome, 'João');
  });

  test('não navega se URL não tiver push_type e push_entry', () => {
    const { sandbox, navSpy } = criarSandbox('');

    sandbox.AppBootstrap.init();

    assert.equal(navSpy.calls.length, 0, 'Pro.nav não deve ser chamado sem parâmetros de push');
  });
});

// ─── Suite 3+4: MinhaBarbeariaPage — enfileirar quando barbershopId null ──────

suite('MinhaBarbeariaPage — enfileira e navega quando #barbershopId é null', () => {

  function criarSandbox() {
    const navSpy = fn();
    const doc    = criarMockDocument();

    const sandbox = vm.createContext({
      document: doc,

      CustomEvent: class {
        constructor(type, opts = {}) {
          this.type   = type;
          this.detail = opts.detail ?? {};
        }
      },
      Event: class { constructor(type) { this.type = type; } },

      // MutationObserver sem efeito — #barbershopId permanece null (não aciona #carregar)
      MutationObserver: class {
        constructor() {}
        observe() {}
        disconnect() {}
      },

      Pro:    { nav: navSpy },
      MediaP2P: class { constructor() {} },

      BarbeiroEsperaFluxo: {
        abrirModalCadeira: fn().mockResolvedValue(null),
        iniciarEspera:     fn(),
        restaurar:         fn(),
        resetarTimer:      fn(),
      },

      CadeiraService: {
        sincronizarFilas: fn().mockResolvedValue([]),
        finalizar:        fn().mockResolvedValue(null),
      },

      AuthService:  { getPerfil: fn().mockReturnValue(null) },
      ApiService:   { getLogoUrl: fn() },

      ClienteAusenteModal: { abrir: fn().mockResolvedValue(null) },

      NotificationService: {
        mostrarToast: fn(),
        TIPOS:        { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' },
      },

      QueueRepository:   { updateClientConfirmed: fn().mockResolvedValue(null) },
      LoggerService:     { warn: fn(), error: fn() },

      SupabaseService: {
        channel:       () => ({ on: fn().mockReturnThis(), subscribe: fn() }),
        removeChannel: fn(),
      },

      setTimeout:    (f, d) => (d <= 0 ? f() : 0),
      clearTimeout:  fn(),
      clearInterval: fn(),
      setInterval:   fn(),
      console:       { error: fn(), warn: fn(), log: fn() },
    });

    carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js');

    const page = new sandbox.MinhaBarbeariaPage();
    page.bind();

    return { sandbox, page, navSpy, doc };
  }

  test('notificacao-nova client_at_shop com barbershopId null → Pro.nav("minha-barbearia") chamado', () => {
    const { doc, navSpy } = criarSandbox();

    doc.dispatchEvent({
      type: 'barberflow:notificacao-nova',
      detail: {
        notif: {
          dados: {
            tipo_acao:     'client_at_shop',
            barbershop_id: BARBERSHOP_ID,
            entry_id:      ENTRY_ID,
            client_name:   'João',
          },
        },
      },
    });

    assert.equal(navSpy.calls.length, 1, 'Pro.nav deve ser chamado ao enfileirar a notificação');
    assert.equal(navSpy.calls[0][0], 'minha-barbearia');
  });

  test('push-show-modal client_at_shop com barbershopId null → Pro.nav("minha-barbearia") chamado', () => {
    const { doc, navSpy } = criarSandbox();

    doc.dispatchEvent({
      type: 'barberflow:push-show-modal',
      detail: {
        pushType:     'client_at_shop',
        entradaId:    ENTRY_ID,
        barbershopId: BARBERSHOP_ID,
        clienteNome:  'João',
      },
    });

    assert.equal(navSpy.calls.length, 1, 'Pro.nav deve ser chamado ao enfileirar push pendente');
    assert.equal(navSpy.calls[0][0], 'minha-barbearia');
  });

  test('notificacao-nova client_not_seated com barbershopId null → Pro.nav("minha-barbearia") chamado', () => {
    const { doc, navSpy } = criarSandbox();

    doc.dispatchEvent({
      type: 'barberflow:notificacao-nova',
      detail: {
        notif: {
          dados: {
            client_not_seated: true,
            barbershop_id:     BARBERSHOP_ID,
            entry_id:          ENTRY_ID,
            client_name:       'Maria',
          },
        },
      },
    });

    assert.equal(navSpy.calls.length, 1, 'Pro.nav deve ser chamado para client_not_seated pendente');
    assert.equal(navSpy.calls[0][0], 'minha-barbearia');
  });
});
