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

const { suite, test } = require('node:test');
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

function criarSandbox({ filaAtiva = [], entradaNova = null } = {}) {
  const QueueRepository = {
    getByBarbershop: fn().mockResolvedValue(filaAtiva),
    updateStatus:    fn().mockResolvedValue({ id: 'x', status: 'done' }),
    entrar:          fn().mockResolvedValue(entradaNova ?? { id: UUID_ENTRY_NOVO, position: 1 }),
  };

  const sandbox = vm.createContext({
    console,
    QueueRepository,
    ApiService: {
      from: fn().mockReturnValue({
        select: fn().mockReturnThis(),
        eq:     fn().mockReturnThis(),
        order:  fn().mockReturnThis(),
        limit:  fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
    UserRepository: {
      getFavoritosModal: fn().mockResolvedValue({ data: [], error: null }),
    },
    LoggerService: { info: fn(), warn: fn(), error: fn() },
  });

  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/CadeiraService.js');

  return { CS: sandbox.CadeiraService, QR: QueueRepository };
}

// =============================================================================
// Suite 1 — finalizar(): auto-avanço da fila de espera
// =============================================================================

suite('CadeiraService.finalizar() — auto-avanço', () => {

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

// =============================================================================
// Suite 2 — sentar('fila'): auto-avanço quando produção está vazia
// =============================================================================

suite('CadeiraService.sentar("fila") — auto-avanço quando produção vazia', () => {

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
// Suite 3 — sincronizarFilas(): promove waiting → in_service na inicialização
// =============================================================================

suite('CadeiraService.sincronizarFilas()', () => {

  test('produção vazia com 1 waiting → promove para in_service', async () => {
    const esperando = entradaWaiting(UUID_ENTRY_ESPERA, UUID_PROF_A, 1, 'Alice');
    const { CS, QR } = criarSandbox({ filaAtiva: [esperando] });

    await CS.sincronizarFilas(UUID_SHOP);

    assert.ok(
      QR.updateStatus.calls.some(([id, st]) => id === UUID_ENTRY_ESPERA && st === 'in_service'),
      'deve promover o waiting para in_service',
    );
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

// =============================================================================
// Suite 4 — sentar('producao'): comportamento existente inalterado
// =============================================================================

suite('CadeiraService.sentar("producao") — comportamento existente', () => {

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
});
