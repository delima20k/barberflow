'use strict';
/**
 * tests/financeiro-service.test.js
 *
 * Testa FinanceiroService:
 *   - registrarCorte chama #calcularTotal (soma de queue_entry_services)
 *   - registrarCorte chama FinanceiroRepository.criarTransacao com payload correto
 *   - registrarCorte despacha barberflow:transacao-criada com barbershopId
 *   - registrarCorte lança TypeError para UUIDs inválidos
 *   - registrarCorte repassa amount=0 quando serviços sem preço
 *   - getResumo chama repository e retorna { geral, barbeiros }
 *   - getTransacoesBarbeiro delega ao repository
 */

const { suite, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// UUIDs válidos (v4)
const ENTRADA_ID    = 'aaaaaaaa-0000-4000-8000-000000000001';
const SHOP_ID       = 'bbbbbbbb-0000-4000-8000-000000000002';
const PROF_ID       = 'cccccccc-0000-4000-8000-000000000003';
const CLIENT_ID     = 'dddddddd-0000-4000-8000-000000000004';

// ── Helpers de sandbox ────────────────────────────────────────────────────────

function criarSandbox({
  servicosPrecos = [35, 20],
  criarTransacaoRetorno = { data: { id: 'tx-001' }, error: null },
} = {}) {
  const eventos = [];

  const sandbox = vm.createContext({
    console,
    // Simula document.dispatchEvent
    document: {
      dispatchEvent: fn().mockImplementation(e => eventos.push({ type: e.type, detail: e.detail })),
      addEventListener: fn(),
    },
    CustomEvent: class CustomEvent {
      constructor(type, opts = {}) {
        this.type   = type;
        this.detail = opts.detail ?? null;
      }
    },
    // ApiService: simula queue_entry_services retornando serviços com preço
    ApiService: {
      from: fn().mockImplementation(tabela => {
        if (tabela === 'queue_entry_services') {
          return {
            select: fn().mockReturnThis(),
            eq: fn().mockImplementation(function () { return this; }),
            then: fn().mockImplementation(cb =>
              Promise.resolve({ data: servicosPrecos.map(price => ({ service: { price } })), error: null }).then(cb)
            ),
          };
        }
        // Fallback genérico
        return {
          select: fn().mockReturnThis(),
          eq: fn().mockImplementation(function () { return this; }),
        };
      }),
    },
    // FinanceiroRepository mock
    FinanceiroRepository: {
      criarTransacao: fn().mockImplementation(async () => {
        if (criarTransacaoRetorno.error) throw criarTransacaoRetorno.error;
        return criarTransacaoRetorno.data;
      }),
      getTotalPeriodo: fn().mockResolvedValue({ count: 3, total: 90 }),
      getResumoPorPeriodo: fn().mockResolvedValue([
        { professionalId: PROF_ID, nome: 'Fulano', count: 3, total: 90 },
      ]),
      getTransacoesBarbeiro: fn().mockResolvedValue([
        { id: 'tx-001', amount: 35, payment_method: 'pix', paid_at: '2026-05-12T10:00:00Z' },
      ]),
    },
    InputValidator: null,
    LoggerService: { warn: fn(), error: fn(), info: fn() },
  });

  // Carrega InputValidator real e FinanceiroService
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/FinanceiroService.js');

  return { sandbox, eventos };
}

// ── Suite principal ───────────────────────────────────────────────────────────

suite('FinanceiroService.registrarCorte', () => {

  test('chama criarTransacao com payload correto (soma dos serviços)', async () => {
    const { sandbox } = criarSandbox({ servicosPrecos: [35, 20] });
    const svc = sandbox.FinanceiroService;

    await svc.registrarCorte({
      entradaId:      ENTRADA_ID,
      barbershopId:   SHOP_ID,
      professionalId: PROF_ID,
      clientId:       CLIENT_ID,
      paymentMethod:  'pix',
    });

    const repo = sandbox.FinanceiroRepository;
    assert.equal(repo.criarTransacao.calls.length, 1, 'deve chamar criarTransacao uma vez');
    const [payload] = repo.criarTransacao.calls[0];
    assert.equal(payload.barbershopId,   SHOP_ID,    'barbershopId correto');
    assert.equal(payload.professionalId, PROF_ID,    'professionalId correto');
    assert.equal(payload.clientId,       CLIENT_ID,  'clientId correto');
    assert.equal(payload.queueEntryId,   ENTRADA_ID, 'queueEntryId correto');
    assert.equal(payload.amount,         55,         'amount = soma dos serviços (35+20)');
    assert.equal(payload.paymentMethod,  'pix',      'paymentMethod correto');
  });

  test('despacha barberflow:transacao-criada com barbershopId', async () => {
    const { sandbox, eventos } = criarSandbox();
    await sandbox.FinanceiroService.registrarCorte({
      entradaId:      ENTRADA_ID,
      barbershopId:   SHOP_ID,
      professionalId: PROF_ID,
      clientId:       null,
      paymentMethod:  'dinheiro',
    });

    const ev = eventos.find(e => e.type === 'barberflow:transacao-criada');
    assert.ok(ev, 'evento barberflow:transacao-criada deve ser disparado');
    assert.equal(ev.detail.barbershopId, SHOP_ID, 'detalhe deve conter barbershopId correto');
  });

  test('retorna amount=0 quando serviços sem preço', async () => {
    const { sandbox } = criarSandbox({ servicosPrecos: [] });
    await sandbox.FinanceiroService.registrarCorte({
      entradaId:      ENTRADA_ID,
      barbershopId:   SHOP_ID,
      professionalId: PROF_ID,
      clientId:       null,
      paymentMethod:  'cartao',
    });

    const [payload] = sandbox.FinanceiroRepository.criarTransacao.calls[0];
    assert.equal(payload.amount, 0, 'amount deve ser 0 quando sem serviços');
  });

  test('retorna amount=0 quando serviços têm price null/undefined', async () => {
    const { sandbox } = criarSandbox({ servicosPrecos: [null, undefined, 0] });
    // Sobrescreve o mock de ApiService para retornar preços nulos
    sandbox.ApiService.from = fn().mockImplementation(() => ({
      select: fn().mockReturnThis(),
      eq: fn().mockImplementation(function () { return this; }),
      then: fn().mockImplementation(cb =>
        Promise.resolve({
          data: [{ service: { price: null } }, { service: { price: undefined } }, { service: null }],
          error: null,
        }).then(cb)
      ),
    }));

    await sandbox.FinanceiroService.registrarCorte({
      entradaId:      ENTRADA_ID,
      barbershopId:   SHOP_ID,
      professionalId: PROF_ID,
      clientId:       null,
      paymentMethod:  'pix',
    });

    const [payload] = sandbox.FinanceiroRepository.criarTransacao.calls[0];
    assert.equal(payload.amount, 0, 'amount deve ser 0 com preços nulos/undefined');
  });

  test('lança TypeError quando entradaId inválido', async () => {
    const { sandbox } = criarSandbox();
    await assert.rejects(
      () => sandbox.FinanceiroService.registrarCorte({
        entradaId:      'nao-um-uuid',
        barbershopId:   SHOP_ID,
        professionalId: PROF_ID,
        clientId:       null,
        paymentMethod:  'pix',
      }),
      { name: 'TypeError' },
    );
  });

  test('lança TypeError quando barbershopId inválido', async () => {
    const { sandbox } = criarSandbox();
    await assert.rejects(
      () => sandbox.FinanceiroService.registrarCorte({
        entradaId:      ENTRADA_ID,
        barbershopId:   '',
        professionalId: PROF_ID,
        clientId:       null,
        paymentMethod:  'pix',
      }),
      { name: 'TypeError' },
    );
  });

  test('lança TypeError quando professionalId inválido', async () => {
    const { sandbox } = criarSandbox();
    await assert.rejects(
      () => sandbox.FinanceiroService.registrarCorte({
        entradaId:      ENTRADA_ID,
        barbershopId:   SHOP_ID,
        professionalId: null,
        clientId:       null,
        paymentMethod:  'pix',
      }),
      { name: 'TypeError' },
    );
  });

  test('não despacha evento quando criarTransacao lança erro', async () => {
    const { sandbox, eventos } = criarSandbox({
      criarTransacaoRetorno: { data: null, error: new Error('DB Error') },
    });
    await assert.rejects(
      () => sandbox.FinanceiroService.registrarCorte({
        entradaId:      ENTRADA_ID,
        barbershopId:   SHOP_ID,
        professionalId: PROF_ID,
        clientId:       null,
        paymentMethod:  'pix',
      }),
    );
    const ev = eventos.find(e => e.type === 'barberflow:transacao-criada');
    assert.equal(ev, undefined, 'evento NÃO deve ser disparado quando há erro no repository');
  });
});

// ── Suite getResumo ───────────────────────────────────────────────────────────

suite('FinanceiroService.getResumo', () => {

  test('retorna { geral, barbeiros } com os dados do repository', async () => {
    const { sandbox } = criarSandbox();
    const resultado = await sandbox.FinanceiroService.getResumo(SHOP_ID, 'hoje');

    assert.ok(resultado.geral,      'deve ter propriedade geral');
    assert.ok(resultado.barbeiros,  'deve ter propriedade barbeiros');
    assert.equal(resultado.geral.count,  3,  'count correto');
    assert.equal(resultado.geral.total,  90, 'total correto');
    assert.equal(resultado.barbeiros.length, 1, 'um barbeiro no resultado');
    assert.equal(resultado.barbeiros[0].nome, 'Fulano', 'nome do barbeiro correto');
  });

  test('lança TypeError quando barbershopId inválido', async () => {
    const { sandbox } = criarSandbox();
    await assert.rejects(
      () => sandbox.FinanceiroService.getResumo('', 'hoje'),
      { name: 'TypeError' },
    );
  });
});

// ── Suite getTransacoesBarbeiro ───────────────────────────────────────────────

suite('FinanceiroService.getTransacoesBarbeiro', () => {

  test('delega ao repository e retorna array', async () => {
    const { sandbox } = criarSandbox();
    const transacoes = await sandbox.FinanceiroService.getTransacoesBarbeiro(SHOP_ID, PROF_ID, 'hoje');

    assert.ok(Array.isArray(transacoes), 'deve retornar array');
    assert.equal(transacoes.length, 1, 'um registro retornado');
    assert.equal(transacoes[0].amount, 35, 'amount correto');
  });
});
