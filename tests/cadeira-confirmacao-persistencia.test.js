'use strict';
/**
 * tests/cadeira-confirmacao-persistencia.test.js
 *
 * Testa a persistência da modal pendente em CadeiraConfirmacaoService:
 *   - persiste bf_confirmacao_pendente ao iniciar fluxo
 *   - limpa persistência após resposta "sim"
 *   - limpa persistência após resposta "nao"
 *   - restaurar: no-op se localStorage vazio
 *   - restaurar: limpa se entry não é in_service no DB
 *   - restaurar: chama iniciarFluxo se entry ainda é in_service
 */

const { suite, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID  = 'cccc0000-0000-4000-8000-000000000003';
const USER_ID   = 'usr-0000-0000-4000-8000-000000000001';
const LS_KEY    = 'bf_confirmacao_pendente';

// ── Sandbox factory ──────────────────────────────────────────────────────────

function criarSandbox({
  modalResposta    = 'sim',
  lsInicial        = null,       // objeto JSON salvo antes — null = vazio
  dbStatus         = 'in_service',
} = {}) {
  // localStorage mock
  const store = lsInicial ? { [LS_KEY]: JSON.stringify(lsInicial) } : {};
  const localStorage = {
    getItem:    fn().mockImplementation(k => store[k] ?? null),
    setItem:    fn().mockImplementation((k, v) => { store[k] = v; }),
    removeItem: fn().mockImplementation(k => { delete store[k]; }),
    _store: store,
  };

  // ApiService mock — from() retorna builder encadeável
  const dbRow = { status: dbStatus };
  const queryBuilder = {
    select: fn().mockReturnThis(),
    eq:     fn().mockReturnThis(),
    single: fn().mockResolvedValue({ data: dbRow, error: null }),
  };
  const ApiService = {
    from: fn().mockReturnValue(queryBuilder),
    rpc:  fn().mockResolvedValue({ data: null, error: null }),
    _queryBuilder: queryBuilder,
  };

  let setTimeoutId = 100;
  const timers = new Map();

  const sandbox = vm.createContext({
    console,
    document: { hidden: false },
    window:   {},
    localStorage,
    ConfirmacaoCorteModal: {
      abrir: fn().mockResolvedValue(modalResposta),
    },
    ApiService,
    QueuePoller:   { tocarSom: fn() },
    LoggerService: { warn: fn(), error: fn() },
    setTimeout: fn().mockImplementation((cb) => {
      const id = ++setTimeoutId;
      timers.set(id, cb);
      return id;
    }),
    clearTimeout: fn().mockImplementation(id => { timers.delete(id); }),
    requestAnimationFrame: fn().mockImplementation(cb => cb()),
  });

  carregar(sandbox, 'shared/js/CadeiraConfirmacaoService.js');
  sandbox.CadeiraConfirmacaoService.parar(); // limpa estado estático entre testes
  // Popula lsInicial DEPOIS de parar() para não ser removido pelo #limparPendente interno
  if (lsInicial) store[LS_KEY] = JSON.stringify(lsInicial);

  return { sandbox, localStorage, ApiService, timers };
}

// ── Testes — Persistência ao iniciar fluxo ───────────────────────────────────

suite('CadeiraConfirmacaoService — persistência (salvar ao iniciar)', () => {

  test('persiste bf_confirmacao_pendente ao iniciar fluxo', async () => {
    const { sandbox, localStorage } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'Carlos', 'https://logo.test/img.png');

    assert.ok(
      localStorage.setItem.calls.some(([k]) => k === LS_KEY),
      'deve chamar localStorage.setItem com a chave bf_confirmacao_pendente',
    );

    // Verifica os dados que foram salvos via setItem.calls
    // (não usa _store pois #limparPendente é chamado após a resposta)
    const chamadaSalvo = localStorage.setItem.calls.find(([k]) => k === LS_KEY);
    assert.ok(chamadaSalvo, 'deve ter chamado setItem com os dados pendentes');
    const dados = JSON.parse(chamadaSalvo[1]);
    assert.equal(dados.entradaId,   ENTRY_ID,                    'entradaId persiste');
    assert.equal(dados.clienteNome, 'Carlos',                    'clienteNome persiste');
    assert.equal(dados.shopLogoUrl, 'https://logo.test/img.png', 'shopLogoUrl persiste');
    assert.ok(dados.ts, 'timestamp deve existir');
  });

  test('limpa persistência após resposta "sim"', async () => {
    const { sandbox, localStorage } = criarSandbox({ modalResposta: 'sim' });
    await sandbox.CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'Carlos');

    assert.ok(
      localStorage.removeItem.calls.some(([k]) => k === LS_KEY),
      'deve chamar localStorage.removeItem com bf_confirmacao_pendente após "sim"',
    );
    assert.equal(localStorage._store[LS_KEY], undefined, 'chave deve ser removida do store');
  });

  test('limpa persistência após resposta "nao"', async () => {
    const { sandbox, localStorage } = criarSandbox({ modalResposta: 'nao' });
    await sandbox.CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'Carlos');

    assert.ok(
      localStorage.removeItem.calls.some(([k]) => k === LS_KEY),
      'deve chamar localStorage.removeItem com bf_confirmacao_pendente após "nao"',
    );
    assert.equal(localStorage._store[LS_KEY], undefined, 'chave deve ser removida do store');
  });
});

// ── Testes — restaurar() ─────────────────────────────────────────────────────

suite('CadeiraConfirmacaoService — restaurar()', () => {

  test('restaurar: no-op se localStorage vazio', async () => {
    const { sandbox, ApiService } = criarSandbox({ lsInicial: null });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.restaurar(USER_ID);

    assert.equal(ApiService.from.calls.length, 0, 'não deve consultar DB se não há dado pendente');
    assert.equal(ApiService._queryBuilder.single.calls.length, 0);
  });

  test('restaurar: limpa localStorage se entry não é in_service no DB', async () => {
    const pendente = { entradaId: ENTRY_ID, clienteNome: 'Carlos', shopLogoUrl: null, ts: Date.now() };
    const { sandbox, localStorage, ApiService } = criarSandbox({
      lsInicial: pendente,
      dbStatus:  'waiting',       // não está mais in_service
    });
    const { CadeiraConfirmacaoService, ConfirmacaoCorteModal } = sandbox;

    await CadeiraConfirmacaoService.restaurar(USER_ID);

    // Não deve abrir modal
    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 0, 'não deve abrir modal');
    // Deve limpar localStorage
    assert.ok(
      localStorage.removeItem.calls.some(([k]) => k === LS_KEY),
      'deve limpar localStorage quando entry não é mais in_service',
    );
  });

  test('restaurar: chama iniciarFluxo se entry ainda é in_service', async () => {
    const pendente = { entradaId: ENTRY_ID, clienteNome: 'Carlos', shopLogoUrl: 'https://logo.test/img.png', ts: Date.now() };
    const { sandbox, ApiService } = criarSandbox({
      lsInicial: pendente,
      dbStatus:  'in_service',
    });
    const { CadeiraConfirmacaoService, ConfirmacaoCorteModal } = sandbox;

    await CadeiraConfirmacaoService.restaurar(USER_ID);

    // Deve consultar o DB filtrando por entradaId e userId
    const fromCalls = ApiService.from.calls;
    assert.ok(fromCalls.length > 0, 'deve consultar DB');
    assert.equal(fromCalls[0][0], 'queue_entries', 'deve consultar tabela queue_entries');

    // Deve ter filtrado pelo client_id (userId) para segurança
    const eqCalls = ApiService._queryBuilder.eq.calls;
    const filtros = eqCalls.map(c => c[0]);
    assert.ok(filtros.includes('client_id'), 'deve filtrar por client_id para segurança');

    // Modal deve ter sido aberto
    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 1, 'deve abrir modal ao restaurar');
    const [{ clienteNome, shopLogoUrl }] = ConfirmacaoCorteModal.abrir.calls[0];
    assert.equal(clienteNome, 'Carlos',                    'clienteNome correto');
    assert.equal(shopLogoUrl, 'https://logo.test/img.png', 'shopLogoUrl correto');
  });
});
