'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/MessagesWidget.js'), 'utf8');

describe('MessagesWidget (shim) — retrocompatibilidade', () => {

  test('classe MessagesWidget está definida', () => {
    assert.ok(SRC.includes('class MessagesWidget'), 'MessagesWidget deve existir');
  });

  test('método init() está definido', () => {
    assert.ok(SRC.includes('static init('), 'init deve estar definido');
  });

  test('método abrirModal() está definido', () => {
    assert.ok(SRC.includes('static async abrirModal('), 'abrirModal deve estar definido');
  });

  test('método fecharModal() está definido', () => {
    assert.ok(SRC.includes('static fecharModal()'), 'fecharModal deve estar definido');
  });

  test('método enviar() está definido', () => {
    assert.ok(SRC.includes('static async enviar()'), 'enviar deve estar definido');
  });

  test('init() delega para UniversalChatPage.init()', () => {
    assert.ok(SRC.includes('UniversalChatPage.init('), 'init deve delegar para UniversalChatPage');
  });

  test('abrirModal() delega para UniversalChatPage.abrirModal()', () => {
    assert.ok(SRC.includes('UniversalChatPage.abrirModal('), 'abrirModal deve delegar para UniversalChatPage');
  });

  test('fecharModal() delega para ChatModal.fechar()', () => {
    assert.ok(SRC.includes('ChatModal.fechar()'), 'fecharModal deve delegar para ChatModal');
  });

  test('enviar() delega para ChatModal.enviar()', () => {
    assert.ok(SRC.includes('ChatModal.enviar()'), 'enviar deve delegar para ChatModal');
  });

  test('não carrega conversas de appointments diretamente', () => {
    assert.ok(!SRC.includes("from('appointments')"), 'não deve usar appointments');
  });

  test('não tem lógica de P2P direto (movida para novas classes)', () => {
    assert.ok(!SRC.includes('initiateConnection('), 'P2P deve estar em UniversalChatPage/ChatModal');
    assert.ok(!SRC.includes('onStatusChange('), 'callbacks P2P não devem estar no shim');
  });
});
