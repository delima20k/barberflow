'use strict';
// =============================================================================
// barbeiro-espera-fluxo.test.js — TDD para BarbeiroEsperaFluxo
//
// Cobertura:
//   - Modal 1 "sim" (cliente sentado)  → { status: 'aguardando' }, sem finalizar
//   - Modal 1 "nao" + modal 2 "aguardar" → { status: 'aguardando' }, sem finalizar
//   - Modal 1 "nao" + modal 2 "remover"  → chama CadeiraService.finalizar
//   - Modal 1 "nao" + modal 2 "remover"  → retorna { status: 'finalizado', proximoNome }
//   - CadeiraService.finalizar lança erro → propaga sem silêncio
//   - Guard: entradaId null + "remover" → não chama finalizar, retorna 'aguardando'
// =============================================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID = 'aaaa0000-0000-4000-8000-000000000001';
const SHOP_ID  = 'bbbb0000-0000-4000-8000-000000000002';
const PROXIMO  = 'Carlos Silva';

// ─── Sandbox factory ─────────────────────────────────────────────────────────

/**
 * @param {object}       opts
 * @param {'sim'|'nao'}  [opts.modal1Resp='sim']      Resposta da 1ª modal
 * @param {string|null}  [opts.modal2Resp=null]        Resposta da 2ª modal
 * @param {object}       [opts.finalizarRetorno]       Retorno de CadeiraService.finalizar
 * @param {Error|null}   [opts.finalizarErro=null]     Se truthy, finalizar rejeita
 */
function criarSandbox({
  modal1Resp     = 'sim',
  modal2Resp     = null,
  finalizarRetorno = { proximoNome: PROXIMO, proximoClienteId: '123' },
  finalizarErro  = null,
} = {}) {
  // Fila de respostas: 1ª chamada → modal1Resp, 2ª → modal2Resp
  const respostas = [modal1Resp, modal2Resp];
  const abrirSpy  = fn().mockImplementation(
    () => Promise.resolve(respostas[abrirSpy.calls.length - 1]),
  );

  const finalizarSpy = finalizarErro
    ? fn().mockRejectedValue(finalizarErro)
    : fn().mockResolvedValue(finalizarRetorno);

  const sandbox = vm.createContext({
    console,
    FluxoDeFila: {
      abrir:   abrirSpy,
      escapar: fn().mockImplementation(str => String(str ?? '')),
    },
    CadeiraService: {
      finalizar: finalizarSpy,
    },
  });

  carregar(sandbox, 'shared/js/BarbeiroEsperaFluxo.js');

  return { sandbox, abrirSpy, finalizarSpy };
}

// ─── Suite 1: cliente sentado (modal 1 = "sim") ───────────────────────────────

suite('BarbeiroEsperaFluxo — cliente sentado (sim na modal 1)', () => {

  test('retorna { status: "aguardando" }', async () => {
    const { sandbox } = criarSandbox({ modal1Resp: 'sim' });
    const resultado = await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    ENTRY_ID,
      barbershopId: SHOP_ID,
    });
    assert.equal(resultado.status, 'aguardando');
  });

  test('não chama CadeiraService.finalizar', async () => {
    const { sandbox, finalizarSpy } = criarSandbox({ modal1Resp: 'sim' });
    await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    ENTRY_ID,
      barbershopId: SHOP_ID,
    });
    assert.equal(finalizarSpy.calls.length, 0, 'finalizar não deve ser chamado');
  });
});

// ─── Suite 2: cliente não sentado + barbeiro quer aguardar ───────────────────

suite('BarbeiroEsperaFluxo — não sentado + aguardar (modal 2 = "aguardar")', () => {

  test('retorna { status: "aguardando" }', async () => {
    const { sandbox } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'aguardar' });
    const resultado = await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    ENTRY_ID,
      barbershopId: SHOP_ID,
    });
    assert.equal(resultado.status, 'aguardando');
  });

  test('não chama CadeiraService.finalizar', async () => {
    const { sandbox, finalizarSpy } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'aguardar' });
    await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    ENTRY_ID,
      barbershopId: SHOP_ID,
    });
    assert.equal(finalizarSpy.calls.length, 0, 'finalizar não deve ser chamado');
  });
});

// ─── Suite 3: cliente não sentado + barbeiro cancela ─────────────────────────

suite('BarbeiroEsperaFluxo — não sentado + cancelar (modal 2 = "remover")', () => {

  test('chama CadeiraService.finalizar com entradaId e barbershopId', async () => {
    const { sandbox, finalizarSpy } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'remover' });
    await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    ENTRY_ID,
      barbershopId: SHOP_ID,
    });
    assert.equal(finalizarSpy.calls.length, 1, 'finalizar deve ser chamado 1x');
    assert.equal(finalizarSpy.calls[0][0], ENTRY_ID, 'primeiro arg: entradaId');
    assert.equal(finalizarSpy.calls[0][1], SHOP_ID,  'segundo arg: barbershopId');
  });

  test('retorna { status: "finalizado", proximoNome }', async () => {
    const { sandbox } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'remover' });
    const resultado = await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    ENTRY_ID,
      barbershopId: SHOP_ID,
    });
    assert.equal(resultado.status, 'finalizado');
    assert.equal(resultado.proximoNome, PROXIMO);
  });

  test('propaga erro de CadeiraService.finalizar sem silêncio', async () => {
    const erro = new Error('DB indisponível');
    const { sandbox } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'remover', finalizarErro: erro });
    await assert.rejects(
      () => sandbox.BarbeiroEsperaFluxo.iniciar({
        clienteNome:  'João',
        entradaId:    ENTRY_ID,
        barbershopId: SHOP_ID,
      }),
      { message: 'DB indisponível' },
    );
  });
});

// ─── Suite 4: guard entradaId nulo ───────────────────────────────────────────

suite('BarbeiroEsperaFluxo — guard entradaId nulo', () => {

  test('não chama CadeiraService.finalizar quando entradaId é null', async () => {
    const { sandbox, finalizarSpy } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'remover' });
    await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    null,
      barbershopId: SHOP_ID,
    });
    assert.equal(finalizarSpy.calls.length, 0, 'finalizar não deve ser chamado sem entradaId');
  });

  test('retorna { status: "aguardando" } quando entradaId é null', async () => {
    const { sandbox } = criarSandbox({ modal1Resp: 'nao', modal2Resp: 'remover' });
    const resultado = await sandbox.BarbeiroEsperaFluxo.iniciar({
      clienteNome:  'João',
      entradaId:    null,
      barbershopId: SHOP_ID,
    });
    assert.equal(resultado.status, 'aguardando');
  });
});
