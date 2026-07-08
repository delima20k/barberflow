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

// Opção C: som do sistema + vibração quando o app está FECHADO/background;
// mp3 customizado (via página) quando o app está em FOREGROUND. O `silent` do
// showNotification passou a ser DINÂMICO (silent:emForeground) — silencia o som
// nativo só quando a página vai tocar o mp3.
describe('Notificacoes push — som dinâmico (Opção C)', () => {
  test('SW profissional: silent dinâmico (emForeground) + vibracao + BF_PUSH_SOUND', () => {
    const src = ler('apps/profissional/sw.js');
    const idxPush = src.indexOf('static push(e)');
    assert.ok(idxPush > 0, 'SW profissional deve ter handler push');
    const bloco = src.slice(idxPush, idxPush + 3200);

    assert.ok(bloco.includes('vibrate:'), 'deve preservar vibracao');
    assert.ok(bloco.includes('silent:             emForeground'), 'silent deve ser dinâmico (foreground)');
    assert.ok(!bloco.includes('silent:             true'), 'nao deve mais silenciar sempre (som do sistema com app fechado)');
    assert.ok(bloco.includes('BF_PUSH_SOUND'), 'deve avisar a pagina para tocar o mp3 em foreground');
    assert.ok(bloco.includes('showNotification'), 'deve manter notificacao visual');
    assert.ok(bloco.includes('PUSH_SHOW_MODAL'), 'deve manter evento de modal');
  });

  test('SW cliente: silent dinâmico (emForeground) + vibracao + BF_PUSH_SOUND', () => {
    const src = ler('apps/cliente/sw.js');
    const idxPush = src.indexOf('static push(e)');
    assert.ok(idxPush > 0, 'SW cliente deve ter handler push');
    const bloco = src.slice(idxPush, idxPush + 2400);

    assert.ok(bloco.includes('vibrate:'), 'deve preservar vibracao');
    assert.ok(bloco.includes('silent:             emForeground'), 'silent deve ser dinâmico (foreground)');
    assert.ok(!bloco.includes('silent:             true'), 'nao deve mais silenciar sempre (som do sistema com app fechado)');
    assert.ok(bloco.includes('BF_PUSH_SOUND'), 'deve avisar a pagina para tocar o mp3 em foreground');
    assert.ok(bloco.includes('showNotification'), 'deve manter notificacao visual');
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
