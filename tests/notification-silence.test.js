'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fn, carregar, ROOT } = require('./_helpers.js');

function ler(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// Som e vibração nativos permanecem habilitados. Quando existe uma janela aberta,
// a página também tenta o MP3 customizado sem depender de showNotification().
describe('Notificacoes push — som e vibracao ativos', () => {
  async function simularPush(relPath, clients = []) {
    const listeners = new Map();
    const events = [];
    const notifications = [];
    const trackedClients = clients.map(client => ({
      ...client,
      postMessage: message => {
        if (message.type === 'BF_PUSH_SOUND') events.push('BF_PUSH_SOUND');
        return client.postMessage?.(message);
      },
    }));
    const sandbox = vm.createContext({
      console,
      Map,
      Promise,
      Date,
      self: {
        addEventListener: (type, handler) => listeners.set(type, handler),
        clients: {
          matchAll: async () => trackedClients,
        },
        registration: {
          getNotifications: async () => [],
          showNotification: async (title, options) => {
            if (options.silent === true && options.vibrate) {
              throw new TypeError('silent and vibrate cannot be used together');
            }
            events.push('showNotification');
            notifications.push({ title, options });
          },
        },
      },
    });

    vm.runInContext(ler(relPath), sandbox, { filename: relPath });
    let pending;
    listeners.get('push')({
      data: {
        json: () => ({
          title: 'Teste',
          data: { eventId: 'queue:test:production_started' },
        }),
      },
      waitUntil: promise => { pending = promise; },
    });
    await pending;
    return { events, notifications };
  }

  test('showNotification não recebe silent:true junto com vibrate', async () => {
    for (const sw of ['apps/profissional/sw.js', 'apps/cliente/sw.js']) {
      const { notifications } = await simularPush(sw);
      assert.equal(notifications.length, 1, `${sw}: deve exibir a notificação`);
      assert.equal(notifications[0].options.silent, false, `${sw}: som deve estar ativo`);
      assert.ok(notifications[0].options.vibrate.length > 0, `${sw}: vibração deve estar configurada`);
    }
  });

  test('janela aberta recebe BF_PUSH_SOUND antes de showNotification', async () => {
    for (const sw of ['apps/profissional/sw.js', 'apps/cliente/sw.js']) {
      const client = {
        focused: true,
        visibilityState: 'visible',
      };
      const { events } = await simularPush(sw, [client]);
      assert.ok(events.indexOf('BF_PUSH_SOUND') < events.indexOf('showNotification'), sw);
    }
  });

  test('SW profissional: silent:false + vibracao + BF_PUSH_SOUND antecipado', () => {
    const src = ler('apps/profissional/sw.js');
    const idxPush = src.indexOf('static push(e)');
    assert.ok(idxPush > 0, 'SW profissional deve ter handler push');
    const bloco = src.slice(idxPush, idxPush + 4200);

    assert.ok(bloco.includes('vibrate:'), 'deve preservar vibracao');
    assert.ok(bloco.includes('silent:             false'), 'som nativo deve permanecer habilitado');
    assert.ok(!bloco.includes('silent:             true'), 'silent:true conflita com vibrate');
    assert.ok(!bloco.includes('silent:             emForeground'), 'foreground também não pode silenciar vibração');
    assert.ok(bloco.includes('temJanelaAberta'), 'deve detectar janela aberta para tentar mp3 em background');
    assert.ok(bloco.includes('BF_PUSH_SOUND'), 'deve avisar a pagina para tocar o mp3 com janela aberta');
    assert.ok(bloco.includes('showNotification'), 'deve manter notificacao visual');
    assert.ok(bloco.includes('PUSH_SHOW_MODAL'), 'deve manter evento de modal');
    assert.ok(
      bloco.indexOf('BF_PUSH_SOUND') < bloco.indexOf('await self.registration.showNotification'),
      'tentativa do mp3 deve ocorrer antes de showNotification',
    );

    const dedupeAteNotificacao = bloco.slice(bloco.indexOf('const pushDuplicado'), bloco.indexOf('await self.registration.showNotification'));
    assert.ok(!dedupeAteNotificacao.includes('return;'), 'push duplicado nao deve cancelar showNotification');
  });

  test('SW cliente: silent:false + vibracao + BF_PUSH_SOUND antecipado', () => {
    const src = ler('apps/cliente/sw.js');
    const idxPush = src.indexOf('static push(e)');
    assert.ok(idxPush > 0, 'SW cliente deve ter handler push');
    const bloco = src.slice(idxPush, idxPush + 2400);

    assert.ok(bloco.includes('vibrate:'), 'deve preservar vibracao');
    assert.ok(bloco.includes('silent:             false'), 'som nativo deve permanecer habilitado');
    assert.ok(!bloco.includes('silent:             true'), 'silent:true conflita com vibrate');
    assert.ok(!bloco.includes('silent:             emForeground'), 'foreground também não pode silenciar vibração');
    assert.ok(bloco.includes('temJanelaAberta'), 'deve detectar janela aberta para tentar mp3 em background');
    assert.ok(bloco.includes('BF_PUSH_SOUND'), 'deve avisar a pagina para tocar o mp3 com janela aberta');
    assert.ok(bloco.includes('showNotification'), 'deve manter notificacao visual');
    assert.ok(
      bloco.indexOf('BF_PUSH_SOUND') < bloco.indexOf('await self.registration.showNotification'),
      'tentativa do mp3 deve ocorrer antes de showNotification',
    );
  });
});

describe('Notificacoes in-app de fila sem chime', () => {
  function criarSandboxNotificationService() {
    const mockBtn = { addEventListener: fn(), classList: { add: fn(), remove: fn() } };
    const mockToast = {
      className: '',
      setAttribute: fn(),
      classList: { add: fn(), remove: fn(), contains: () => false },
      addEventListener: fn(),
      querySelector: () => mockBtn,
      appendChild: fn(),
      remove: fn(),
      style: {},
      innerHTML: '',
      isConnected: true,
      offsetWidth: 0,
    };
    const mockContainer = { appendChild: fn() };

    const sandbox = vm.createContext({
      document: {
        getElementById: () => mockContainer,
        createElement: () => ({ ...mockToast }),
      },
      localStorage: { getItem: () => null, setItem: fn(), removeItem: fn() },
      setTimeout: fn(),
      clearTimeout: fn(),
      QueuePoller: { tocarSom: fn() },
      SupabaseService: { getSession: fn().mockResolvedValue(null) },
      LoggerService: { warn: fn(), error: fn() },
    });

    carregar(sandbox, 'shared/js/NotificationService.js');
    return sandbox;
  }

  test('NotificationService nao chama QueuePoller.tocarSom para agendamento', () => {
    const sandbox = criarSandboxNotificationService();

    sandbox.NotificationService.mostrarToast(
      'Cliente presente',
      'O cliente chegou.',
      sandbox.NotificationService.TIPOS.AGENDAMENTO,
    );

    assert.equal(sandbox.QueuePoller.tocarSom.calls.length, 0);
  });

  test('QueuePoller.tocarSom nao cria Audio quando som de fila esta desativado', () => {
    const addEventListener = fn();
    const audioSpy = fn().mockReturnValue({
      preload: '',
      volume: 1,
      currentTime: 0,
      play: fn().mockResolvedValue(undefined),
      pause: fn(),
    });
    const sandbox = vm.createContext({
      console,
      document: { addEventListener, removeEventListener: fn(), hidden: false },
      Audio: audioSpy,
      QueueRepository: { getByBarbershop: fn().mockResolvedValue([]) },
      LoggerService: { warn: fn(), error: fn() },
      setInterval: fn().mockReturnValue(1),
      clearInterval: fn(),
    });

    carregar(sandbox, 'shared/js/QueuePoller.js');
    sandbox.QueuePoller.tocarSom();

    assert.equal(audioSpy.calls.length, 0);
    assert.equal(addEventListener.calls.length, 0);
  });

  test('QueueConfirmService nao cria Audio nem AudioContext para alerta de fila', () => {
    const audioSpy = fn().mockReturnValue({
      play: fn().mockResolvedValue(undefined),
      volume: 1,
    });
    const audioContextSpy = fn().mockReturnValue({});
    const sandbox = vm.createContext({
      document: { addEventListener: fn(), removeEventListener: fn() },
      window: { AudioContext: audioContextSpy },
      Audio: audioSpy,
      SupabaseService: { client: {} },
      NotificationService: {
        criar: fn(),
        mostrarToast: fn(),
        TIPOS: { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' },
      },
      CadeiraConfirmacaoService: { iniciarFluxo: fn().mockResolvedValue(undefined) },
    });

    carregar(sandbox, 'shared/js/QueueConfirmService.js');

    assert.ok(
      ler('shared/js/QueueConfirmService.js').includes('static #SOM_HABILITADO = false'),
      'alerta sonoro do QueueConfirmService deve estar desativado por configuracao explicita',
    );
    assert.equal(audioSpy.calls.length, 0);
    assert.equal(audioContextSpy.calls.length, 0);
  });
});
