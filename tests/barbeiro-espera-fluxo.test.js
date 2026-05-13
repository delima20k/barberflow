'use strict';
// =============================================================================
// barbeiro-espera-fluxo.test.js — TDD para BarbeiroEsperaFluxo
//
// Cobertura:
//   Suite 1: iniciarEspera — toca som, registra estado, guard de duplicata
//   Suite 2: estaAguardando — false antes, true depois, false após finalizar
//   Suite 3: finalizarEspera — remove estado, chama clearInterval
//   Suite 4: abrirModalCadeira — 3 ações + null tratado como 'aguardar'
//   Suite 5: resetarTimer — cancela + reinicia sem duplicar
//   Suite 6: localStorage — persiste ao iniciar, limpa ao finalizar, restaurar()
//   Suite 7: barberflow:espera-resolvida — despacha com acao + barbershopId
// =============================================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID = 'aaaa0000-0000-4000-8000-000000000001';
const SHOP_ID  = 'bbbb0000-0000-4000-8000-000000000002';
const NOME     = 'João Silva';

// ─── Sandbox factory ─────────────────────────────────────────────────────────

let _idCounter = 0;

function criarSandbox({ modalResp = 'chegou', lsStore = {} } = {}) {
  const abrirSpy       = fn().mockImplementation(() => Promise.resolve(modalResp));
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

// ─── Suite 1: iniciarEspera ───────────────────────────────────────────────────

suite('BarbeiroEsperaFluxo — iniciarEspera', () => {

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

// ─── Suite 2: estaAguardando ──────────────────────────────────────────────────

suite('BarbeiroEsperaFluxo — estaAguardando', () => {

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

// ─── Suite 3: finalizarEspera ─────────────────────────────────────────────────

suite('BarbeiroEsperaFluxo — finalizarEspera', () => {

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

// ─── Suite 4: abrirModalCadeira ───────────────────────────────────────────────

suite('BarbeiroEsperaFluxo — abrirModalCadeira', () => {

  test('retorna "chegou" quando FluxoDeFila resolve "chegou"', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'chegou' });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'chegou');
  });

  test('retorna "remover" quando FluxoDeFila resolve "remover"', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'remover' });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'remover');
  });

  test('retorna "aguardar" quando FluxoDeFila resolve "aguardar"', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'aguardar' });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'aguardar');
  });

  test('retorna "aguardar" quando FluxoDeFila resolve null (overlay duplicado fechado)', async () => {
    const { sandbox } = criarSandbox({ modalResp: null });
    const res = await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(res, 'aguardar');
  });

  test('abrirModalCadeira usa id fixo "modal-espera-cadeira"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'chegou' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const config = abrirSpy.calls[0][0];
    assert.equal(config.id, 'modal-espera-cadeira');
  });

  test('corpo menciona "está a caminho para a barbearia"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'chegou' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const config = abrirSpy.calls[0][0];
    assert.ok(config.corpo.includes('está a caminho para a barbearia'), `corpo="${config.corpo}"`);
  });

  test('contém 3 ações: chegou, remover e aguardar', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'chegou' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    const valores = abrirSpy.calls[0][0].acoes.map(a => a.valor);
    assert.ok(valores.includes('chegou'),  'deve ter ação chegou');
    assert.ok(valores.includes('remover'), 'deve ter ação remover');
    assert.ok(valores.includes('aguardar'), 'deve ter ação aguardar');
  });
});

// ─── Suite 5: resetarTimer ────────────────────────────────────────────────────

suite('BarbeiroEsperaFluxo — resetarTimer', () => {

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

// ─── Suite 6: localStorage ────────────────────────────────────────────────────

suite('BarbeiroEsperaFluxo — localStorage', () => {

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

// ─── Suite 7: barberflow:espera-resolvida ─────────────────────────────────────

suite('BarbeiroEsperaFluxo — evento barberflow:espera-resolvida', () => {

  test('abrirModalCadeira despacha evento com acao="chegou"', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResp: 'chegou' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls.length, 1, 'deve despachar 1 evento');
    assert.equal(dispatchSpy.calls[0][0].detail.acao, 'chegou');
  });

  test('abrirModalCadeira despacha evento com acao="remover"', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResp: 'remover' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls[0][0].detail.acao, 'remover');
  });

  test('abrirModalCadeira NÃO despacha evento quando acao="aguardar"', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResp: 'aguardar' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls.length, 0, 'não deve despachar evento em "aguardar"');
  });

  test('evento contém barbershopId correto', async () => {
    const { sandbox, dispatchSpy } = criarSandbox({ modalResp: 'chegou' });
    await sandbox.BarbeiroEsperaFluxo.abrirModalCadeira({ clienteNome: NOME, entradaId: ENTRY_ID, barbershopId: SHOP_ID });
    assert.equal(dispatchSpy.calls[0][0].detail.barbershopId, SHOP_ID);
  });
});
