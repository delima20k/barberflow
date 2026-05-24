'use strict';
// =============================================================================
// barbeiro-espera-fluxo.test.js — TDD para BarbeiroEsperaFluxo
//
// Cobertura:
//   describe 1: iniciarEspera — toca som, registra estado, guard de duplicata
//   describe 2: estaAguardando — false antes, true depois, false após finalizar
//   describe 3: finalizarEspera — remove estado, chama clearInterval
//   describe 4: abrirModalCadeira — 2 botões (Sim/Não) + segundo modal após Não
//   describe 5: resetarTimer — cancela + reinicia sem duplicar
//   describe 6: localStorage — persiste ao iniciar, limpa ao finalizar, restaurar()
//   describe 7: barberflow:espera-resolvida — despacha com acao + barbershopId
// =============================================================================

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID = 'aaaa0000-0000-4000-8000-000000000001';
const SHOP_ID  = 'bbbb0000-0000-4000-8000-000000000002';
const NOME     = 'João Silva';

// ─── Sandbox factory ─────────────────────────────────────────────────────────

let _idCounter = 0;

function criarSandbox({ modalResp = 'sim', modalResps = null, lsStore = {} } = {}) {
  let _callCount = 0;
  const _responses = modalResps ?? [modalResp];
  const abrirSpy = fn().mockImplementation(() => {
    const val = _callCount < _responses.length ? _responses[_callCount] : null;
    _callCount++;
    return Promise.resolve(val);
  });
  const tocarSomSpy    = fn();
  const dispatchSpy    = fn();
  const setIntervalSpy = fn().mockImplementation(() => ++_idCounter);
  const clearIntervalSpy = fn();

  const ls = { ...lsStore };
  const localStorageMock = {
    getItem:    fn().mockImplementation(k => ls[k] ?? null),
    setItem:    fn().mockImplementation((k, v) => { ls[k] = v; }),
    removeItem: fn().mockImplementation(k => { delete ls[k]; }),
    _store: ls,
  };

  const documentMock = { dispatchEvent: dispatchSpy };

  const sandbox = vm.createContext({
    console,
    FluxoDeFila: {
      abrir:   abrirSpy,
      escapar: fn().mockImplementation(s => String(s ?? '')),
    },
    QueuePoller:   { tocarSom: tocarSomSpy },
    localStorage:  localStorageMock,
    document:      documentMock,
    CustomEvent:   class CustomEvent {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail ?? {}; }
    },
    setInterval:   setIntervalSpy,
    clearInterval: clearIntervalSpy,
  });

  carregar(sandbox, 'shared/js/BarbeiroEsperaFluxo.js');

  return { sandbox, abrirSpy, tocarSomSpy, dispatchSpy, setIntervalSpy, clearIntervalSpy, localStorageMock, ls };
}

// ─── describe 1: iniciarEspera ───────────────────────────────────────────────────

describe('BarbeiroEsperaFluxo — iniciarEspera', () => {

  test('toca som ao iniciar espera', () => {
    const { sandbox, tocarSomSpy } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(tocarSomSpy.calls.length, 1, 'QueuePoller.tocarSom deve ser chamado 1x');
  });

  test('registra entrada no estado interno', () => {
    const { sandbox } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.ok(sandbox.BarbeiroEsperaFluxo.estaAguardando(ENTRY_ID), 'estaAguardando deve retornar true');
  });

  test('guard: segunda chamada com mesmo entradaId não toca som novamente', () => {
    const { sandbox, tocarSomSpy } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(tocarSomSpy.calls.length, 1, 'som deve tocar apenas na primeira vez');
  });

  test('guard: segunda chamada com mesmo entradaId não inicia segundo timer', () => {
    const { sandbox, setIntervalSpy } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(setIntervalSpy.calls.length, 1, 'setInterval deve ser chamado apenas 1x');
  });
});

// ─── describe 2: estaAguardando ──────────────────────────────────────────────────

describe('BarbeiroEsperaFluxo — estaAguardando', () => {

  test('retorna false antes de iniciarEspera', () => {
    const { sandbox } = criarSandbox();
    assert.equal(sandbox.BarbeiroEsperaFluxo.estaAguardando(ENTRY_ID), false);
  });

  test('retorna true depois de iniciarEspera', () => {
    const { sandbox } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(sandbox.BarbeiroEsperaFluxo.estaAguardando(ENTRY_ID), true);
  });

  test('retorna false depois de finalizarEspera', () => {
    const { sandbox } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    sandbox.BarbeiroEsperaFluxo.finalizarEspera(ENTRY_ID);
    assert.equal(sandbox.BarbeiroEsperaFluxo.estaAguardando(ENTRY_ID), false);
  });
});

// ─── describe 3: finalizarEspera ─────────────────────────────────────────────────

describe('BarbeiroEsperaFluxo — finalizarEspera', () => {

  test('chama clearInterval ao finalizar', () => {
    const { sandbox, clearIntervalSpy } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    sandbox.BarbeiroEsperaFluxo.finalizarEspera(ENTRY_ID);
    assert.equal(clearIntervalSpy.calls.length, 1, 'clearInterval deve ser chamado 1x');
  });

  test('remove entrada do estado interno', () => {
    const { sandbox } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    sandbox.BarbeiroEsperaFluxo.finalizarEspera(ENTRY_ID);
    assert.equal(sandbox.BarbeiroEsperaFluxo.estaAguardando(ENTRY_ID), false);
  });

  test('não lança erro ao finalizar entradaId inexistente', () => {
    const { sandbox } = criarSandbox();
    assert.doesNotThrow(() => sandbox.BarbeiroEsperaFluxo.finalizarEspera('inexistente'));
  });
});

// ─── describe 4: abrirModalCadeira ───────────────────────────────────────────────

describe('BarbeiroEsperaFluxo — abrirModalCadeira', () => {

  test('retorna "chegou" quando barbeiro clica Sim', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'sim' });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'chegou');
  });

  test('retorna "remover" quando barbeiro clica Não → Cancelar atendimento', async () => {
    const { sandbox } = criarSandbox({ modalResps: ['nao', 'cancelar'] });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'remover');
  });

  test('retorna "aguardar" quando barbeiro clica Não → Esperar mais', async () => {
    const { sandbox } = criarSandbox({ modalResps: ['nao', 'esperar'] });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'aguardar');
  });

  test('retorna "aguardar" quando primeiro modal retorna null (overlay fechado por acidente)', async () => {
    const { sandbox } = criarSandbox({ modalResp: null });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'aguardar');
  });

  test('abrirModalCadeira usa id fixo "modal-espera-cadeira" no primeiro modal', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'sim' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const config = abrirSpy.calls[0][0];
    assert.equal(config.id, 'modal-espera-cadeira');
  });

  test('primeiro modal tem botões "Sim" e "Não" (exatamente 2)', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'sim' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const labels = abrirSpy.calls[0][0].acoes.map(a => a.label);
    assert.ok(labels.includes('Sim'), 'deve ter botão Sim');
    assert.ok(labels.includes('Não'), 'deve ter botão Não');
    assert.equal(abrirSpy.calls[0][0].acoes.length, 2, 'deve ter exatamente 2 botões');
  });

  test('segundo modal abre quando barbeiro clica Não', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResps: ['nao', 'esperar'] });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(abrirSpy.calls.length, 2, 'deve abrir 2 modais');
  });

  test('segundo modal tem "Esperar mais" e "Cancelar atendimento"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResps: ['nao', 'esperar'] });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const labels2 = abrirSpy.calls[1][0].acoes.map(a => a.label);
    assert.ok(labels2.includes('Esperar mais'),         'deve ter Esperar mais');
    assert.ok(labels2.includes('Cancelar atendimento'), 'deve ter Cancelar atendimento');
  });

  test('segundo modal tem exatamente 2 botões', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResps: ['nao', 'cancelar'] });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(abrirSpy.calls[1][0].acoes.length, 2);
  });

  test('null no segundo modal retorna "remover" por segurança', async () => {
    const { sandbox } = criarSandbox({ modalResps: ['nao', null] });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'remover');
  });
});

// ─── describe 5: resetarTimer ────────────────────────────────────────────────────

describe('BarbeiroEsperaFluxo — resetarTimer', () => {

  test('chama clearInterval e depois setInterval novamente', () => {
    const { sandbox, setIntervalSpy, clearIntervalSpy } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(setIntervalSpy.calls.length, 1, 'deve ter 1 setInterval após iniciar');

    sandbox.BarbeiroEsperaFluxo.resetarTimer(ENTRY_ID);
    assert.equal(clearIntervalSpy.calls.length, 1, 'deve ter 1 clearInterval ao resetar');
    assert.equal(setIntervalSpy.calls.length, 2, 'deve ter 2 setInterval ao resetar (cancela + cria novo)');
  });

  test('resetarTimer em entradaId sem espera ativa não lança erro', () => {
    const { sandbox } = criarSandbox();
    assert.doesNotThrow(() => sandbox.BarbeiroEsperaFluxo.resetarTimer('nao-existe'));
  });
});

// ─── describe 6: localStorage ────────────────────────────────────────────────────

describe('BarbeiroEsperaFluxo — localStorage', () => {

  test('iniciarEspera persiste no localStorage', () => {
    const { sandbox, localStorageMock } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.ok(localStorageMock.setItem.calls.length >= 1, 'setItem deve ser chamado ao persistir');
  });

  test('finalizarEspera atualiza localStorage', () => {
    const { sandbox, localStorageMock } = criarSandbox();
    sandbox.BarbeiroEsperaFluxo.iniciarEspera({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const setBefore = localStorageMock.setItem.calls.length;
    sandbox.BarbeiroEsperaFluxo.finalizarEspera(ENTRY_ID);
    const setAfter = localStorageMock.setItem.calls.length + localStorageMock.removeItem.calls.length;
    assert.ok(setAfter > setBefore, 'localStorage deve ser atualizado ao finalizar');
  });

  test('restaurar() registra entradas do localStorage no estado interno', () => {
    const lsData = JSON.stringify({ [ENTRY_ID]: { clienteNome: NOME, barbershopId: SHOP_ID } });
    const { sandbox } = criarSandbox({ lsStore: { 'bf_espera_barbeiro': lsData } });
    sandbox.BarbeiroEsperaFluxo.restaurar();
    assert.equal(sandbox.BarbeiroEsperaFluxo.estaAguardando(ENTRY_ID), true, 'restaurar deve registrar estado do localStorage');
  });

  test('restaurar() reinicia timers para entradas restauradas', () => {
    const lsData = JSON.stringify({ [ENTRY_ID]: { clienteNome: NOME, barbershopId: SHOP_ID } });
    const { sandbox, setIntervalSpy } = criarSandbox({ lsStore: { 'bf_espera_barbeiro': lsData } });
    sandbox.BarbeiroEsperaFluxo.restaurar();
    assert.ok(setIntervalSpy.calls.length >= 1, 'setInterval deve ser chamado ao restaurar timer');
  });
});

// ─── describe 7: barberflow:espera-resolvida ─────────────────────────────────────

describe('BarbeiroEsperaFluxo — evento barberflow:espera-resolvida', () => {

  test('abrirModalCadeira despacha evento com acao="chegou" quando Sim', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResp: 'sim' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls.length, 1, 'deve despachar 1 evento');
    assert.equal(dispatchSpy.calls[0][0].detail.acao, 'chegou');
  });

  test('abrirModalCadeira despacha evento com acao="remover" quando Não → Cancelar', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResps: ['nao', 'cancelar'] });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls[0][0].detail.acao, 'remover');
  });

  test('abrirModalCadeira NÃO despacha evento quando Não → Esperar mais', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResps: ['nao', 'esperar'] });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls.length, 0, 'não deve despachar evento em "aguardar"');
  });

  test('evento contém barbershopId correto', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResp: 'sim' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls[0][0].detail.barbershopId, SHOP_ID);
  });
});
