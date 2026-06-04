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

  test('limpa badge e destaque ao marcar conversa aberta como lida', () => {
    assert.ok(SRC.includes('#marcarConversaComoLida'), 'deve centralizar limpeza de nao lidas');
    assert.ok(SRC.includes("card.classList.remove('barber-row--unread')"), 'deve remover destaque amarelo');
    assert.ok(SRC.includes("card.querySelector('.chat-badge')?.remove()"), 'deve remover contador amarelo');
    assert.ok(SRC.includes('ChatApiClient.marcarConversaComoLida'), 'deve persistir leitura via BFF');
  });

  test('nao incrementa nao lidas quando a conversa esta aberta', () => {
    assert.ok(SRC.includes('#conversaAbertaId'), 'deve rastrear conversa aberta');
    assert.ok(SRC.includes('convId === UniversalChatPage.#conversaAbertaId'), 'deve comparar evento com conversa aberta');
  });

  test('atualiza ponto amarelo do rodape de mensagens', () => {
    assert.ok(SRC.includes('#atualizarIndicadorRodape'), 'deve centralizar indicador do rodape');
    assert.ok(SRC.includes('nav-btn--unread'), 'deve usar classe reutilizavel de unread no botao');
    assert.ok(SRC.includes('[data-tela="mensagens"]'), 'deve funcionar em cliente e profissional');
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
