'use strict';
// =============================================================================
// cliente-ausente-modal.test.js — TDD para ClienteAusenteModal
//
// Cobertura:
//   describe 1: modo 'ausente' — texto e ações padrão
//   describe 2: modo 'nao_sentado' — texto "a caminho" e ações
//   describe 3: retornos — mapeamento de valores
// =============================================================================

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const NOME = 'Arthur Lima';

function criarSandbox({ modalResp = 'remover' } = {}) {
  const abrirSpy = fn().mockImplementation(() => Promise.resolve(modalResp));

  const sandbox = vm.createContext({
    console,
    FluxoDeFila: {
      abrir:   abrirSpy,
      escapar: fn().mockImplementation(s => String(s ?? '')),
    },
  });

  carregar(sandbox, 'shared/js/ClienteAusenteModal.js');

  return { sandbox, abrirSpy };
}

// ─── describe 1: modo 'ausente' ─────────────────────────────────────────────────

describe('ClienteAusenteModal — modo ausente', () => {

  test('título é "Cliente ausente"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'remover' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME });
    const config = abrirSpy.calls[0][0];
    assert.equal(config.titulo, 'Cliente ausente');
  });

  test('corpo menciona "não confirmou presença"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'remover' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME });
    const config = abrirSpy.calls[0][0];
    assert.ok(config.corpo.includes('não confirmou presença'), `corpo="${config.corpo}"`);
  });

  test('ações incluem "remover" e "mensagem"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: 'remover' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME });
    const valores = abrirSpy.calls[0][0].acoes.map(a => a.valor);
    assert.ok(valores.includes('remover'),  'deve ter ação remover');
    assert.ok(valores.includes('mensagem'), 'deve ter ação mensagem');
  });

  test('retorna "remover" quando FluxoDeFila resolve "remover"', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'remover' });
    const res = await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME });
    assert.equal(res, 'remover');
  });

  test('retorna "mensagem" quando FluxoDeFila resolve "mensagem"', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'mensagem' });
    const res = await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME });
    assert.equal(res, 'mensagem');
  });
});

// ─── describe 2: modo 'nao_sentado' ─────────────────────────────────────────────

describe('ClienteAusenteModal — modo nao_sentado', () => {

  test('título é "Cliente a caminho"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: '_aguardar' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    const config = abrirSpy.calls[0][0];
    assert.equal(config.titulo, 'Cliente a caminho');
  });

  test('corpo menciona "avisou que ainda está a caminho"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: '_aguardar' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    const config = abrirSpy.calls[0][0];
    assert.ok(config.corpo.includes('avisou que ainda está a caminho'), `corpo="${config.corpo}"`);
  });

  test('ações incluem "OK, aguardar" e "Chamar próximo"', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: '_aguardar' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    const labels = abrirSpy.calls[0][0].acoes.map(a => a.label);
    assert.ok(labels.includes('OK, aguardar'),    'deve ter botão OK, aguardar');
    assert.ok(labels.includes('Chamar próximo'), 'deve ter botão Chamar próximo');
  });

  test('retorna null quando barbeiro clica "OK, aguardar" (_aguardar → null)', async () => {
    const { sandbox } = criarSandbox({ modalResp: '_aguardar' });
    const res = await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    assert.equal(res, null);
  });

  test('retorna "remover" quando barbeiro clica "Chamar próximo"', async () => {
    const { sandbox } = criarSandbox({ modalResp: 'remover' });
    const res = await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    assert.equal(res, 'remover');
  });

  test('NÃO tem ação "mensagem" no modo nao_sentado', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: '_aguardar' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    const valores = abrirSpy.calls[0][0].acoes.map(a => a.valor);
    assert.ok(!valores.includes('mensagem'), 'não deve ter ação mensagem no modo nao_sentado');
  });

  test('corpo contém o nome do cliente', async () => {
    const { sandbox, abrirSpy } = criarSandbox({ modalResp: '_aguardar' });
    await sandbox.ClienteAusenteModal.abrir({ clienteNome: NOME, modo: 'nao_sentado' });
    const config = abrirSpy.calls[0][0];
    assert.ok(config.corpo.includes(NOME), `corpo deve conter "${NOME}", recebeu: "${config.corpo}"`);
  });
});
