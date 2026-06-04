'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/ChatModal.js'), 'utf8');

describe('ChatModal — análise estática de segurança e contrato', () => {

  test('classe ChatModal está definida', () => {
    assert.ok(SRC.includes('class ChatModal'), 'ChatModal deve ser definida');
  });

  test('método estático abrir() existe', () => {
    assert.ok(SRC.includes('static async abrir('), 'abrir() deve ser estático');
  });

  test('método estático fechar() existe', () => {
    assert.ok(SRC.includes('static fechar()'), 'fechar() deve ser estático');
  });

  test('método estático enviar() existe', () => {
    assert.ok(SRC.includes('static async enviar()'), 'enviar() deve ser estático');
  });

  test('usa textContent para renderizar corpo da mensagem (anti-XSS)', () => {
    assert.ok(SRC.includes('.textContent = texto'), 'corpo da mensagem deve usar textContent');
  });

  test('renderiza identificacao visual do remetente em cada mensagem', () => {
    assert.ok(SRC.includes('chat-message-avatar'), 'deve renderizar avatar por mensagem');
    assert.ok(SRC.includes('chat-message-sender'), 'deve renderizar nome do remetente');
    assert.ok(SRC.includes('chat-message-date'), 'deve renderizar data da mensagem');
    assert.ok(SRC.includes('sender?.name'), 'deve consumir sender.name vindo da BFF/realtime');
    assert.ok(SRC.includes('#remetenteFallback'), 'deve ter fallback de remetente sem anonimato');
  });

  test('avatar personalizado e fallback usam DOM seguro', () => {
    assert.ok(SRC.includes("document.createElement('img')"), 'avatar personalizado deve usar img criada via DOM');
    assert.ok(SRC.includes('img.alt'), 'avatar deve ter texto alternativo');
    assert.ok(SRC.includes('avatar.textContent ='), 'fallback deve usar inicial via textContent');
    assert.ok(SRC.includes('ApiService.getAvatarUrl'), 'avatarPath deve resolver URL publica pelo ApiService');
  });

  test('mensagem otimista usa remetente local do AuthService', () => {
    assert.ok(SRC.includes('#remetenteLocal()'), 'deve montar remetente local');
    assert.ok(SRC.includes('AuthService.getPerfil'), 'deve buscar perfil local em cache');
  });

  test('não usa innerHTML para injetar texto de usuário (apenas limpar com vazio é permitido)', () => {
    // innerHTML = '' (limpar) é aceitável. O que NÃO é aceitável é inserir variáveis com texto do usuário.
    // Verifica que nenhum innerHTML recebe uma template string ou variável com conteúdo de mensagem.
    const badPattern = /\.innerHTML\s*=\s*`[^`]*\${/;
    assert.ok(!badPattern.test(SRC), 'innerHTML não deve receber template string com variáveis');
  });

  test('chama MessageModerationService.verificar antes de enviar', () => {
    assert.ok(
      SRC.includes('MessageModerationService.verificar('),
      'moderação deve ser chamada antes do envio'
    );
  });

  test('gera clientMessageId para idempotência', () => {
    assert.ok(SRC.includes('clientMessageId'), 'deve gerar clientMessageId');
    assert.ok(SRC.includes('crypto.randomUUID()'), 'deve usar crypto.randomUUID()');
  });

  test('tenta P2P antes do BFF (segurança: não cria bypass)', () => {
    const p2pIdx = SRC.indexOf('P2PMessageConnectionService.sendMessage');
    const bffIdx = SRC.indexOf('ChatApiClient.enviarMensagem');
    assert.ok(p2pIdx < bffIdx, 'P2P deve ser tentado antes do BFF');
  });

  test('não armazena conteúdo de mensagem em localStorage', () => {
    assert.ok(!SRC.includes('localStorage.setItem'), 'não deve usar localStorage para mensagens');
  });

  test('aviso de moderação não usa alert()', () => {
    assert.ok(!SRC.includes('alert('), 'não deve usar alert() para avisos');
  });

  test('fallback P2P usa BFF (não descarta mensagem silenciosamente)', () => {
    assert.ok(
      SRC.includes('ChatApiClient.enviarMensagem'),
      'fallback BFF deve existir quando P2P falha'
    );
  });
  test('marca conversa aberta como lida quando realtime entrega nova mensagem', () => {
    assert.ok(
      SRC.includes('#despacharConversaLida'),
      'deve emitir evento de leitura quando mensagem chega na conversa aberta',
    );
    assert.ok(
      SRC.includes('ChatModal.#despacharConversaLida(msg.conversationId)'),
      'deve marcar a conversa aberta como lida apos renderizar mensagem realtime',
    );
  });
});
