'use strict';

const { describe, it } = require('node:test');
const assert            = require('node:assert/strict');
const { Result }             = require('../../../domain/shared/Result');
const { EntrarNaFilaUseCase } = require('../../../application/fila/EntrarNaFilaUseCase');

const SHOP = '11111111-1111-1111-1111-111111111111';
const PROF = '22222222-2222-2222-2222-222222222222';
const SERV = '44444444-4444-4444-4444-444444444444';

/** Fake IFilaRepository — em memória, sem Supabase. */
function criarFilaRepositoryFake({ ativos = 0, servicosOk = true } = {}) {
  const chamadas = { save: [], linkServicos: [] };
  return {
    chamadas,
    async countAtivos()               { return Result.ok(ativos); },
    async servicosValidos()           { return Result.ok(servicosOk); },
    async save(entrada)               { chamadas.save.push(entrada); return Result.ok(); },
    async linkServicos(id, shopId, serviceIds) { chamadas.linkServicos.push({ id, shopId, serviceIds }); return Result.ok(); },
  };
}

/** Fake BarbeariaRepository — em memória. */
function criarBarbeariaRepositoryFake({ shop = { id: SHOP, name: 'Barbearia Teste', is_open: true, is_active: true, close_reason: null }, vinculado = true } = {}) {
  return {
    async getStatusOperacional()        { return shop; },
    async profissionalTemVinculoAtivo() { return vinculado; },
  };
}

describe('EntrarNaFilaUseCase — visitante sem conta (guest)', () => {
  it('entra na fila com sucesso sem profissional/serviços e sem barbeariaRepository injetado', async () => {
    const filaRepository = criarFilaRepositoryFake({ ativos: 2 });
    const useCase = new EntrarNaFilaUseCase({ filaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan', guestPhone: '11999998888' });

    assert.equal(r.isOk(), true);
    const dados = r.getValue();
    assert.equal(dados.clienteId, null);
    assert.equal(dados.guestName, 'Alan');
    assert.equal(dados.guestPhone, '11999998888');
    assert.equal(dados.posicao, 3); // ativos(2) + 1
    assert.equal(dados.status, 'waiting');
    assert.equal(filaRepository.chamadas.save.length, 1);
  });

  it('rejeita payload inválido antes de tocar o repositório (sem clienteId nem guestName)', async () => {
    const filaRepository = criarFilaRepositoryFake();
    const useCase = new EntrarNaFilaUseCase({ filaRepository });

    const r = await useCase.execute({ barbershopId: SHOP });

    assert.equal(r.isFail(), true);
    assert.equal(filaRepository.chamadas.save.length, 0);
  });

  it('falha quando a barbearia está fechada', async () => {
    const filaRepository = criarFilaRepositoryFake();
    const barbeariaRepository = criarBarbeariaRepositoryFake({
      shop: { id: SHOP, name: 'Barbearia Teste', is_open: false, is_active: true, close_reason: null },
    });
    const useCase = new EntrarNaFilaUseCase({ filaRepository, barbeariaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan' });

    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /fechada/);
    assert.equal(filaRepository.chamadas.save.length, 0);
  });

  it('mensagem específica quando fechada para almoço', async () => {
    const filaRepository = criarFilaRepositoryFake();
    const barbeariaRepository = criarBarbeariaRepositoryFake({
      shop: { id: SHOP, name: 'Barbearia Teste', is_open: false, is_active: true, close_reason: 'almoco' },
    });
    const useCase = new EntrarNaFilaUseCase({ filaRepository, barbeariaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan' });

    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /almoço/);
  });

  it('falha quando a barbearia não existe', async () => {
    const filaRepository = criarFilaRepositoryFake();
    const barbeariaRepository = criarBarbeariaRepositoryFake({ shop: null });
    const useCase = new EntrarNaFilaUseCase({ filaRepository, barbeariaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan' });

    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /não encontrada/);
  });

  it('falha quando o profissional informado não está vinculado à barbearia', async () => {
    const filaRepository = criarFilaRepositoryFake();
    const barbeariaRepository = criarBarbeariaRepositoryFake({ vinculado: false });
    const useCase = new EntrarNaFilaUseCase({ filaRepository, barbeariaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan', profissionalId: PROF });

    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /vinculado/);
    assert.equal(filaRepository.chamadas.save.length, 0);
  });

  it('falha quando algum serviço escolhido é inválido', async () => {
    const filaRepository = criarFilaRepositoryFake({ servicosOk: false });
    const useCase = new EntrarNaFilaUseCase({ filaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan', serviceIds: [SERV] });

    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /serviços/);
    assert.equal(filaRepository.chamadas.save.length, 0);
  });

  it('vincula os serviços escolhidos após salvar a entrada', async () => {
    const filaRepository = criarFilaRepositoryFake();
    const useCase = new EntrarNaFilaUseCase({ filaRepository });

    const r = await useCase.execute({ barbershopId: SHOP, guestName: 'Alan', serviceIds: [SERV] });

    assert.equal(r.isOk(), true);
    assert.equal(filaRepository.chamadas.linkServicos.length, 1);
    assert.deepEqual(filaRepository.chamadas.linkServicos[0].serviceIds, [SERV]);
  });

  it('sucesso completo: barbearia aberta + profissional vinculado + serviços válidos', async () => {
    const filaRepository = criarFilaRepositoryFake({ ativos: 0 });
    const barbeariaRepository = criarBarbeariaRepositoryFake();
    const useCase = new EntrarNaFilaUseCase({ filaRepository, barbeariaRepository });

    const r = await useCase.execute({
      barbershopId: SHOP, guestName: 'Alan', guestPhone: '11999998888',
      profissionalId: PROF, serviceIds: [SERV],
    });

    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().posicao, 1);
  });
});
