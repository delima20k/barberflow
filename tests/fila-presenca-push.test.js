'use strict';
/**
 * tests/fila-presenca-push.test.js
 *
 * Garante que FilaPresencaService chama BffApiService.post('/api/v1/notificacoes/push-barbeiro')
 * em TODOS os fluxos que enviam notificação ao barbeiro:
 *
 *   1. processarSim (resposta 'sim') → type 'client_at_shop'
 *   2. _dispararGrace (timer de 5 min expirou) → type 'client_not_seated'
 *
 * Bug corrigido: anteriormente #notificarBarbeiro só fazia ApiService.rpc (Realtime),
 * nunca chamava BffApiService → barbeiro com app fechado não recebia Web Push.
 */

const { suite, test } = require('node:test');
const assert           = require('node:assert/strict');
const vm               = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const BARBERSHOP_ID   = 'aaaa0000-0000-4000-8000-000000000001';
const PROFESSIONAL_ID = 'bbbb0000-0000-4000-8000-000000000002';
const CLIENT_ID       = 'cccc0000-0000-4000-8000-000000000003';
const ENTRY_ID        = 'dddd0000-0000-4000-8000-000000000004';

const PERFIL = { id: CLIENT_ID, full_name: 'João Silva', role: 'client' };

// ─── Factory da sandbox VM ────────────────────────────────────────────────────

function criarSandbox(overrides = {}) {
  const bffCalls = [];

  const sandbox = vm.createContext({
    console,

    QueueModalPayloadBuilder: {
      montarPayloadPresencaFisica: fn().mockReturnValue({
        titulo: 'Você está na barbearia?',
        corpo:  '',
        acoes:  [{ label: 'Sim', valor: 'sim' }, { label: 'Não', valor: 'nao' }],
      }),
    },

    FluxoDeFila: {
      abrir:   fn().mockResolvedValue('sim'),
      escapar: (s) => String(s ?? ''),
    },

    QueueRepository: {
      updateClientConfirmed: fn().mockResolvedValue(null),
    },

    ApiService: {
      rpc: fn().mockResolvedValue({ data: null, error: null }),
    },

    AuthService: {
      getPerfil: fn().mockReturnValue(PERFIL),
    },

    BffApiService: {
      post: fn().mockImplementation((path, body) => {
        bffCalls.push({ path, body });
        return Promise.resolve({ data: { ok: true }, error: null });
      }),
    },

    NotificationService: {
      mostrarToast: fn(),
      TIPOS: { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' },
    },

    LoggerService: {
      warn:  fn(),
      error: fn(),
    },

    ...overrides,
  });

  carregar(sandbox, 'shared/js/FilaPresencaService.js');

  return { sandbox, bffCalls };
}

// ─── Suite: processarSim ('sim' → client_at_shop) ─────────────────────────────

suite('FilaPresencaService — BFF push no fluxo "sim" (client_at_shop)', () => {

  test('chama BffApiService.post com path correto', async () => {
    const { sandbox, bffCalls } = criarSandbox();
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, { id: BARBERSHOP_ID, name: 'Barbearia Test' }, PROFESSIONAL_ID);

    assert.ok(
      bffCalls.some(c => c.path === '/api/v1/notificacoes/push-barbeiro'),
      'deve chamar BffApiService.post com o path de push-barbeiro',
    );
  });

  test('payload contém professionalId, entradaId, barbershopId e type client_at_shop', async () => {
    const { sandbox, bffCalls } = criarSandbox();
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, { id: BARBERSHOP_ID, name: 'Barbearia Test' }, PROFESSIONAL_ID);

    const chamada = bffCalls.find(c => c.path === '/api/v1/notificacoes/push-barbeiro');
    assert.ok(chamada, 'deve existir chamada ao endpoint de push-barbeiro');

    const { body } = chamada;
    assert.strictEqual(body.professionalId, PROFESSIONAL_ID, 'professionalId incorreto');
    assert.strictEqual(body.entradaId,      ENTRY_ID,        'entradaId incorreto');
    assert.strictEqual(body.barbershopId,   BARBERSHOP_ID,   'barbershopId incorreto');
    assert.strictEqual(body.type,           'client_at_shop', 'type deve ser client_at_shop');
    assert.ok(body.clienteNome,             'clienteNome deve ser fornecido');
  });

  test('não chama BffApiService se professionalId for null', async () => {
    const { sandbox, bffCalls } = criarSandbox({
      FluxoDeFila: {
        abrir:   fn().mockResolvedValue('sim'),
        escapar: (s) => String(s ?? ''),
      },
    });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, { id: BARBERSHOP_ID }, null);

    assert.strictEqual(bffCalls.length, 0, 'não deve chamar BFF sem professionalId');
  });
});

// ─── Suite: _dispararGrace (timer → client_not_seated ou client_arriving_late) ──

suite('FilaPresencaService — BFF push no fluxo _dispararGrace', () => {

  test('chama BffApiService.post após disparar grace', async () => {
    const { sandbox, bffCalls } = criarSandbox();
    const { FilaPresencaService } = sandbox;

    FilaPresencaService._dispararGrace(ENTRY_ID, PROFESSIONAL_ID, BARBERSHOP_ID, 'Maria');

    // aguarda microtasks (o método interno usa .catch(() => {}))
    await new Promise(resolve => setImmediate(resolve));

    assert.ok(
      bffCalls.some(c => c.path === '/api/v1/notificacoes/push-barbeiro'),
      'deve chamar BffApiService.post via _dispararGrace',
    );
  });

  test('payload de _dispararGrace tem type mapeado para client_not_seated', async () => {
    const { sandbox, bffCalls } = criarSandbox();
    const { FilaPresencaService } = sandbox;

    FilaPresencaService._dispararGrace(ENTRY_ID, PROFESSIONAL_ID, BARBERSHOP_ID, 'Maria');
    await new Promise(resolve => setImmediate(resolve));

    const chamada = bffCalls.find(c => c.path === '/api/v1/notificacoes/push-barbeiro');
    assert.ok(chamada, 'deve existir chamada ao endpoint de push-barbeiro');

    const { body } = chamada;
    assert.strictEqual(body.professionalId, PROFESSIONAL_ID);
    assert.strictEqual(body.entradaId,      ENTRY_ID);
    assert.strictEqual(body.barbershopId,   BARBERSHOP_ID);
    assert.ok(
      body.type === 'client_not_seated' || body.type === 'client_arriving_late',
      `type deve ser client_not_seated ou client_arriving_late, recebido: "${body.type}"`,
    );
    assert.strictEqual(body.clienteNome, 'Maria');
  });
});

// ─── BFF push: erro logado via LoggerService ─────────────────────────────────

suite('FilaPresencaService — BFF push: erro logado via LoggerService', () => {

  test('loga warn quando BffApiService retorna erro em iniciarFluxo', async () => {
    const { sandbox } = criarSandbox({
      BffApiService: {
        post: fn().mockImplementation(() =>
          Promise.resolve({ data: null, error: new Error('VAPID não configurado') }),
        ),
      },
    });
    const { FilaPresencaService, LoggerService } = sandbox;

    await FilaPresencaService.iniciarFluxo(
      ENTRY_ID,
      { id: BARBERSHOP_ID, name: 'Barbearia Test' },
      PROFESSIONAL_ID,
    );
    await new Promise(r => setTimeout(r, 0));

    const logado = LoggerService.warn.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('push-barbeiro')),
    );
    assert.ok(logado, 'LoggerService.warn deve ser chamado quando BFF retorna erro');
  });
});
