'use strict';
/**
 * tests/cadeira-service.test.js
 *
 * Testa CadeiraService: auto-avanço automático da fila de espera → produção.
 *
 * Cenários cobertos:
 *   finalizar() — marca done + auto-avança próximo waiting para in_service
 *   finalizar() — filtra por professionalId (não avança fila de outro barbeiro)
 *   finalizar() — sem próximo, não tenta updateStatus extra
 *   sentar('fila') — produção vazia → auto-avança entry nova para in_service
 *   sentar('fila') — produção ocupada → mantém waiting
 *   sentar('producao') — vai direto para in_service (comportamento existente)
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_SHOP         = 'b0000000-0000-4000-8000-000000000001';
const UUID_PROF_A       = 'a0000000-0000-4000-8000-000000000001';
const UUID_PROF_B       = 'a1111111-0000-4000-8000-000000000001';
const UUID_CLI          = 'c0000000-0000-4000-8000-000000000001';
const UUID_ENTRY_ATUAL  = 'e0000000-0000-4000-8000-000000000001';
const UUID_ENTRY_ESPERA = 'e1111111-0000-4000-8000-000000000001';
const UUID_ENTRY_OUTRO  = 'e2222222-0000-4000-8000-000000000001';
const UUID_ENTRY_NOVO   = 'e3333333-0000-4000-8000-000000000001';

// ─── Helpers de fila ─────────────────────────────────────────────────────────

function entradaInService(id, profId) {
  return {
    id,
    status: 'in_service',
    position: 0,
    professional: { id: profId },
    client: { id: UUID_CLI, full_name: 'Carlos' },
  };
}

function entradaWaiting(id, profId, position = 1, nomeCliente = 'Alice') {
  return {
    id,
    status: 'waiting',
    position,
    professional: { id: profId },
    client: { id: UUID_CLI, full_name: nomeCliente },
  };
}

// ─── Factory da sandbox VM ───────────────────────────────────────────────────

function criarSandbox({ filaAtiva = [], entradaNova = null, shopAberta = true } = {}) {
  const fetchCalls = [];
  const QueueRepository = {
    getByBarbershop: fn().mockResolvedValue(filaAtiva),
    updateStatus:    fn().mockResolvedValue({ id: 'x', status: 'done' }),
    entrar:          fn().mockResolvedValue(entradaNova ?? { id: UUID_ENTRY_NOVO, position: 1 }),
  };

  const shopData = shopAberta
    ? { is_open: true,  name: 'Barbearia Teste', close_reason: null }
    : { is_open: false, name: 'Barbearia Teste', close_reason: null };

  const bffPosts = [];
  const sandbox = vm.createContext({
    console,
    QueueRepository,
    ApiService: {
      from: fn().mockReturnValue({
        select:      fn().mockReturnThis(),
        eq:          fn().mockReturnThis(),
        order:       fn().mockReturnThis(),
        limit:       fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: fn().mockResolvedValue({ data: shopData, error: null }),
      }),
    },
    UserRepository: {
      getFavoritosModal: fn().mockResolvedValue({ data: [], error: null }),
    },
    SupabaseService: {
      getSession: fn().mockResolvedValue({ access_token: 'token-teste' }),
    },
    // Push ao barbeiro (0→1) vai por aqui — registra as chamadas p/ asserção
    BffApiService: {
      post: fn().mockImplementation((path, body) => {
        bffPosts.push({ path, body });
        return Promise.resolve({ data: { ok: true }, error: null });
      }),
    },
    fetch: fn().mockImplementation((url, opts) => {
      fetchCalls.push({ url, opts });
      return Promise.resolve({ ok: true });
    }),
    LoggerService: { info: fn(), warn: fn(), error: fn() },
  });

  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/CadeiraService.js');

  return { CS: sandbox.CadeiraService, QR: QueueRepository, fetchCalls, bffPosts };
}

// =============================================================================
// describe 1 — finalizar(): auto-avanço da fila de espera
// =============================================================================

describe('CadeiraService.finalizar() — auto-avanço', () => {

  test('marca entrada atual como "done"', async () => {
    const { CS, QR } = criarSandbox({ filaAtiva: [] });
    await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP);
    const chamadas = QR.updateStatus.calls;
    assert.ok(
      chamadas.some(([id, st]) => id === UUID_ENTRY_ATUAL && st === 'done'),
      'deve chamar updateStatus(entradaAtual, "done")',
    );
  });

  test('auto-avança próximo waiting para "in_service"', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A);
    const { CS, QR } = criarSandbox({ filaAtiva: [esperando] });

    await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    const chamadas = QR.updateStatus.calls;
    assert.ok(
      chamadas.some(([id, st]) => id === UUID_ENTRY_ESPERA && st === 'in_service'),
      'deve promover o próximo waiting para in_service',
    );
  });

  test('transição 0→1 pelo finalizar NÃO dispara push ao barbeiro (ação do próprio barbeiro)', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [esperando] });

    await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    const push = bffPosts.find(item => item.body?.type === 'production_started');
    assert.ok(!push, 'finalizar() é ação do próprio barbeiro — não deve notificar a si mesmo');
  });

  test('retorna proximoNome quando há próximo na fila', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS } = criarSandbox({ filaAtiva: [esperando] });

    const result = await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    assert.strictEqual(result.proximoNome, 'Alice');
  });

  test('retorna proximoNome=null quando fila vazia', async () => {
    const { CS, QR } = criarSandbox({ filaAtiva: [] });

    const result = await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    assert.strictEqual(result.proximoNome, null);
    // Segundo updateStatus NÃO deve ter sido chamado com 'in_service'
    const temAutoAvanco = QR.updateStatus.calls
      .some(([, st]) => st === 'in_service');
    assert.strictEqual(temAutoAvanco, false, 'não deve chamar updateStatus("in_service") sem próximo');
  });

  test('filtra por professionalId: NÃO avança waiting de outro barbeiro', async () => {
    const esperandoOutro  = entradaWaiting(UUID_ENTRY_OUTRO,  UUID_PROF_B, 1, 'Bob');
    const esperandoCorreto = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 2, 'Alice');
    const filaAtiva = [esperandoOutro, esperandoCorreto];

    const { CS, QR } = criarSandbox({ filaAtiva });

    await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    const chamadas = QR.updateStatus.calls;
    // Deve avançar o de PROF_A
    assert.ok(
      chamadas.some(([id, st]) => id === UUID_ENTRY_ESPERA && st === 'in_service'),
      'deve avançar o waiting do mesmo profissional',
    );
    // NÃO deve avançar o de PROF_B
    assert.ok(
      !chamadas.some(([id, st]) => id === UUID_ENTRY_OUTRO && st === 'in_service'),
      'não deve avançar waiting de outro profissional',
    );
  });

  test('avança o waiting de menor position quando há múltiplos', async () => {
    const pos3 = entradaWaiting('e-pos3-00-0000-4000-8000-000000000001', UUID_PROF_A, 3, 'Carlos');
    const pos1 = entradaWaiting('e-pos1-00-0000-4000-8000-000000000001', UUID_PROF_A, 1, 'Alice');
    const pos2 = entradaWaiting('e-pos2-00-0000-4000-8000-000000000001', UUID_PROF_A, 2, 'Bob');

    const { CS, QR } = criarSandbox({ filaAtiva: [pos3, pos1, pos2] });

    const result = await CS.finalizar(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    assert.strictEqual(result.proximoNome, 'Alice', 'deve retornar o de menor position');
    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === pos1.id && st === 'in_service'),
      'deve promover o de position=1',
    );
  });

  test('rejeita entradaId inválido com TypeError', async () => {
    const { CS } = criarSandbox();
    await assert.rejects(
      () => CS.finalizar('nao-e-uuid', UUID_SHOP),
      (err) => err.name === 'TypeError',
    );
  });

  test('rejeita barbershopId inválido com TypeError', async () => {
    const { CS } = criarSandbox();
    await assert.rejects(
      () => CS.finalizar(UUID_ENTRY_ATUAL, 'nao-e-uuid'),
      (err) => err.name === 'TypeError',
    );
  });
});

describe('CadeiraService - Web Push de posicao da fila', () => {
  test('nao dispara queue_position_update diretamente para evitar duplicidade com trigger DB', async () => {
    const atual = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, fetchCalls } = criarSandbox({ filaAtiva: [atual] });

    await CS.promoverParaProducao({
      entradaId: atual.id,
      barbershopId: UUID_SHOP,
      professionalId: UUID_PROF_A,
      filaAtiva: [atual],
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const positionPushes = fetchCalls
      .map(call => JSON.parse(call.opts.body))
      .filter(body => body.pushType === 'queue_position_update');

    assert.equal(positionPushes.length, 0);
  });

});

// =============================================================================
// describe 2 — sentar('fila'): auto-avanço quando produção está vazia
// =============================================================================

describe('CadeiraService.sentar("fila") — auto-avanço quando produção vazia', () => {

  test('produção vazia → chama updateStatus("in_service") na nova entrada', async () => {
    // Fila sem nenhum in_service para PROF_A
    const { CS, QR } = criarSandbox({
      filaAtiva:   [],
      entradaNova: { id: UUID_ENTRY_NOVO, position: 1 },
    });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'fila',
    });

    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_NOVO && st === 'in_service'),
      'deve promover entry nova para in_service quando produção vazia',
    );
  });

  test('produção ocupada → NÃO chama updateStatus("in_service")', async () => {
    const jaEmServico = entradaInService(UUID_ENTRY_ATUAL, UUID_PROF_A);
    const { CS, QR } = criarSandbox({
      filaAtiva:   [jaEmServico],
      entradaNova: { id: UUID_ENTRY_NOVO, position: 1 },
    });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'fila',
    });

    assert.ok(
      !QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_NOVO && st === 'in_service'),
      'não deve promover quando produção já ocupada',
    );
  });

  test('produção de outro barbeiro vazia não afeta — filtra por professionalId', async () => {
    // PROF_B tem in_service, mas PROF_A não
    const emServicoProfB = entradaInService(UUID_ENTRY_ATUAL, UUID_PROF_B);
    const { CS, QR } = criarSandbox({
      filaAtiva:   [emServicoProfB],
      entradaNova: { id: UUID_ENTRY_NOVO, position: 1 },
    });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'fila',
    });

    // PROF_A não tem in_service → deve promover
    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_NOVO && st === 'in_service'),
      'deve promover para PROF_A quando produção de PROF_A está vazia',
    );
  });
});

// =============================================================================
// describe 3 — sincronizarFilas(): promove waiting → in_service na inicialização
// =============================================================================

describe('CadeiraService.sincronizarFilas()', () => {

  test('produção vazia com 1 waiting → promove para in_service', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, QR } = criarSandbox({ filaAtiva: [esperando] });

    await CS.sincronizarFilas(UUID_SHOP);

    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_ESPERA && st === 'in_service'),
      'deve promover o waiting para in_service',
    );
  });

  test('transição 0→1 pela sincronização NÃO dispara push ao barbeiro (carregamento do próprio app)', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [esperando] });

    await CS.sincronizarFilas(UUID_SHOP);

    const push = bffPosts.find(item => item.body?.type === 'production_started');
    assert.ok(!push, 'sincronizarFilas() só roda no carregamento da própria tela do barbeiro — não deve notificá-lo');
  });

  test('produção já ocupada → NÃO chama updateStatus', async () => {
    const emServico = entradaInService(UUID_ENTRY_ATUAL,  UUID_PROF_A);
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, QR } = criarSandbox({ filaAtiva: [emServico, esperando] });

    await CS.sincronizarFilas(UUID_SHOP);

    assert.ok(
      !QR.updateStatus.calls.some(([, st]) => st === 'in_service'),
      'não deve chamar updateStatus quando produção já ocupada',
    );
  });

  test('fila vazia → retorna sem chamar updateStatus', async () => {
    const { CS, QR } = criarSandbox({ filaAtiva: [] });

    await CS.sincronizarFilas(UUID_SHOP);

    assert.strictEqual(QR.updateStatus.calls.length, 0, 'nenhuma chamada deve ser feita');
  });

  test('múltiplos barbeiros: cada um sincronizado independentemente', async () => {
    const espA = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const inSvB = entradaInService(UUID_ENTRY_ATUAL, UUID_PROF_B);
    const espB  = entradaWaiting(UUID_ENTRY_OUTRO,  UUID_PROF_B, 1, 'Bob');
    const { CS, QR } = criarSandbox({ filaAtiva: [espA, inSvB, espB] });

    await CS.sincronizarFilas(UUID_SHOP);

    // PROF_A (produção vazia) → deve promover espA
    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_ESPERA && st === 'in_service'),
      'deve promover PROF_A waiting',
    );
    // PROF_B (produção ocupada) → NÃO deve promover espB
    assert.ok(
      !QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_OUTRO && st === 'in_service'),
      'não deve promover PROF_B waiting',
    );
  });

  test('promove o de menor position quando há múltiplos waiting', async () => {
    const w2 = entradaWaiting('e-w2-0000-0000-4000-8000-000000000001', UUID_PROF_A, 2, 'Bob');
    const w1 = entradaWaiting('e-w1-0000-0000-4000-8000-000000000001', UUID_PROF_A, 1, 'Alice');
    const { CS, QR } = criarSandbox({ filaAtiva: [w2, w1] });

    await CS.sincronizarFilas(UUID_SHOP);

    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === w1.id && st === 'in_service'),
      'deve promover o de menor position (w1)',
    );
    assert.ok(
      !QR.updateStatus.calls.some(([id]) => id === w2.id),
      'não deve promover w2 (segunda posição)',
    );
  });

  test('rejeita barbershopId inválido com TypeError', async () => {
    const { CS } = criarSandbox();
    await assert.rejects(
      () => CS.sincronizarFilas('nao-e-uuid'),
      (err) => err.name === 'TypeError',
    );
  });
});

describe('CadeiraService.liberarSemCorte() — push ao auto-avançar', () => {
  test('transição 0→1 pelo liberarSemCorte NÃO dispara push ao barbeiro (ação do próprio barbeiro)', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [esperando] });

    await CS.liberarSemCorte(UUID_ENTRY_ATUAL, UUID_SHOP, UUID_PROF_A);

    const push = bffPosts.find(item => item.body?.type === 'production_started');
    assert.ok(!push, 'liberarSemCorte() é ação do próprio barbeiro — não deve notificar a si mesmo');
  });
});

// =============================================================================
// describe 4 — sentar('producao'): comportamento existente inalterado
// =============================================================================

describe('CadeiraService.sentar("producao") — comportamento existente', () => {

  test('sempre chama updateStatus("in_service") na entrada criada', async () => {
    const { CS, QR } = criarSandbox({
      entradaNova: { id: UUID_ENTRY_NOVO, position: 0 },
    });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'producao',
    });

    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_NOVO && st === 'in_service'),
      'sentar("producao") deve ir direto para in_service',
    );
  });

  test('notificarCliente=false suprime push send-push do app cliente', async () => {
    const { CS, fetchCalls } = criarSandbox({
      entradaNova: { id: UUID_ENTRY_NOVO, position: 0 },
    });

    await CS.sentar({
      barbershopId:     UUID_SHOP,
      professionalId:   UUID_PROF_A,
      clientId:         UUID_CLI,
      serviceIds:       [],
      tipo:             'producao',
      notificarCliente: false,
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(fetchCalls.length, 0, 'não deve chamar Edge Function send-push do cliente');
  });
});

// =============================================================================
// describe 5 — sentar(): barbearia fechada bloqueia inserção
// =============================================================================

describe('CadeiraService.sentar() — barbearia fechada', () => {

  test('lança erro 403 quando barbearia está fechada (is_open=false)', async () => {
    const { CS } = criarSandbox({ shopAberta: false });

    await assert.rejects(
      () => CS.sentar({
        barbershopId:   UUID_SHOP,
        professionalId: UUID_PROF_A,
        clientId:       UUID_CLI,
        serviceIds:     [],
        tipo:           'producao',
      }),
      (err) => err.status === 403,
      'deve rejeitar com status 403',
    );
  });

  test('não chama QueueRepository.entrar() quando barbearia está fechada', async () => {
    const { CS, QR } = criarSandbox({ shopAberta: false });

    await assert.rejects(() => CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'fila',
    }));

    assert.strictEqual(QR.entrar.calls.length, 0, 'entrar() não deve ser chamado');
  });

  test('procede normalmente quando barbearia está aberta (is_open=true)', async () => {
    const { CS, QR } = criarSandbox({
      shopAberta:  true,
      entradaNova: { id: UUID_ENTRY_NOVO, position: 1 },
    });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'producao',
    });

    assert.strictEqual(QR.entrar.calls.length, 1, 'entrar() deve ser chamado uma vez');
  });
});

// =============================================================================
// describe 6 — sentar(): push ao BARBEIRO na transição 0→1 (cadeira produção vazia)
// =============================================================================

describe('CadeiraService.sentar() — push ao barbeiro no 0→1', () => {

  const emProducao = (profId) => ({
    id:           'in-service-existente',
    status:       'in_service',
    professional: { id: profId },
    client:       { id: UUID_CLI, full_name: 'Zé' },
  });

  test('sentar("fila") com produção VAZIA dispara push production_started ao barbeiro', async () => {
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [] });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'fila',
    });

    const push = bffPosts.find(p => p.path.includes('push-barbeiro'));
    assert.ok(push, 'deve chamar push-barbeiro na transição 0→1');
    assert.strictEqual(push.body.type, 'production_started');
    assert.strictEqual(push.body.professionalId, UUID_PROF_A);
    assert.strictEqual(push.body.entradaId, UUID_ENTRY_NOVO);
  });

  test('sentar("fila") com produção OCUPADA NÃO dispara push ao barbeiro (não é 0→1)', async () => {
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [emProducao(UUID_PROF_A)] });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'fila',
    });

    const push = bffPosts.find(p => p.path.includes('push-barbeiro'));
    assert.ok(!push, 'cadeira ocupada → sem push ao barbeiro');
  });

  test('sentar("producao") com cadeira vazia dispara push (usa guestName como clienteNome)', async () => {
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [] });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       null,
      guestName:      'Avulso',
      serviceIds:     [],
      tipo:           'producao',
    });

    const push = bffPosts.find(p => p.path.includes('push-barbeiro'));
    assert.ok(push, 'produção direta com cadeira vazia é 0→1');
    assert.strictEqual(push.body.type, 'production_started');
    assert.strictEqual(push.body.clienteNome, 'Avulso');
  });

  test('sentar("producao") pelo profissional nao dispara push ao proprio barbeiro', async () => {
    const { CS, QR, bffPosts } = criarSandbox({ filaAtiva: [] });

    await CS.sentar({
      barbershopId: UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId: UUID_CLI,
      serviceIds: [],
      tipo: 'producao',
      notificarBarbeiro: false,
    });

    const push = bffPosts.find(p => p.path.includes('push-barbeiro'));
    assert.ok(!push, 'acao do profissional nao deve notificar o proprio barbeiro');
    assert.ok(
      QR.updateStatus.calls.some(([id, status]) => id === UUID_ENTRY_NOVO && status === 'in_service'),
      'cliente deve continuar sendo promovido para producao',
    );
  });

  test('sentar("producao") com produção OCUPADA NÃO dispara push (substituição, não 0→1)', async () => {
    const { CS, bffPosts } = criarSandbox({ filaAtiva: [emProducao(UUID_PROF_A)] });

    await CS.sentar({
      barbershopId:   UUID_SHOP,
      professionalId: UUID_PROF_A,
      clientId:       UUID_CLI,
      serviceIds:     [],
      tipo:           'producao',
    });

    const push = bffPosts.find(p => p.path.includes('push-barbeiro'));
    assert.ok(!push, 'cadeira já ocupada → não é transição 0→1');
  });
});
