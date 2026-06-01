'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/UniversalChatPage.js'), 'utf8');

describe('UniversalChatPage — análise estática', () => {

  test('classe está definida', () => {
    assert.ok(SRC.includes('class UniversalChatPage'), 'UniversalChatPage deve ser definida');
  });

  test('método init() é estático', () => {
    assert.ok(SRC.includes('static init('), 'init deve ser estático');
  });

  test('método abrirModal() é estático', () => {
    assert.ok(SRC.includes('static async abrirModal('), 'abrirModal deve ser estático e async');
  });

  test('não acessa tabela appointments (carregamento migrado para BFF)', () => {
    assert.ok(!SRC.includes("from('appointments')"), 'não deve usar tabela appointments');
    assert.ok(!SRC.includes('"appointments"'), 'não deve referenciar appointments diretamente');
  });

  test('delega para ConversationListService.carregar()', () => {
    assert.ok(SRC.includes('ConversationListService.carregar('), 'deve delegar ao ConversationListService');
  });

  test('delega abertura para ChatModal.abrir()', () => {
    assert.ok(SRC.includes('ChatModal.abrir('), 'deve usar ChatModal para abrir chat');
  });

  test('usa textContent para renderizar nomes nos cards', () => {
    assert.ok(SRC.includes('.textContent = conv.nome'), 'nome deve usar textContent');
  });

  test('usa textContent para preview da conversa', () => {
    assert.ok(SRC.includes('.textContent ='), 'preview deve usar textContent');
  });

  test('atualiza preview, horario, badge e destaque ao receber nova mensagem', () => {
    assert.ok(SRC.includes('previewEl.textContent = preview'), 'deve atualizar trecho da ultima mensagem');
    assert.ok(SRC.includes('horaEl.textContent'), 'deve atualizar horario da ultima mensagem');
    assert.ok(SRC.includes('chat-badge'), 'deve atualizar indicador de nao lida');
    assert.ok(SRC.includes('barber-row--unread'), 'deve destacar conversa correspondente');
  });

  test('notificacao in-app de nova mensagem inclui remetente e trecho', () => {
    assert.ok(SRC.includes('#notificarMensagemNova'), 'deve centralizar notificacao in-app');
    assert.ok(SRC.includes('detail?.sender'), 'deve consumir remetente do evento de chat');
    assert.ok(SRC.includes('NotificationService.mostrarToast'), 'deve usar notificacao in-app existente');
  });

  test('escuta customEvent chatflow:mensagem-nova', () => {
    assert.ok(SRC.includes("'chatflow:mensagem-nova'"), 'deve ouvir evento de nova mensagem');
  });

  test('inicializa ChatSearchWidget', () => {
    assert.ok(SRC.includes('ChatSearchWidget.init('), 'deve inicializar o widget de busca');
  });

  test('renderiza strip de favoritos', () => {
    assert.ok(SRC.includes('msgs-favoritos-strip'), 'deve renderizar strip de favoritos');
  });

  test('cards usam role=button para acessibilidade', () => {
    assert.ok(SRC.includes("'button'"), 'cards devem ter role button');
    assert.ok(SRC.includes("'tabindex'"), 'cards devem ser focáveis');
  });
});
