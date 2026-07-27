'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./_helpers');

const SERVICE_JS = fs.readFileSync(path.join(ROOT, 'shared/js/MensalidadeInterestService.js'), 'utf8');
const BARBEARIA_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
const BFF_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BffApiService.js'), 'utf8');
const MESSAGES_JS = fs.readFileSync(path.join(ROOT, 'shared/js/MessagesWidget.js'), 'utf8');
const UNIVERSAL_CHAT_JS = fs.readFileSync(path.join(ROOT, 'shared/js/UniversalChatPage.js'), 'utf8');
const CHAT_MODAL_JS = fs.readFileSync(path.join(ROOT, 'shared/js/ChatModal.js'), 'utf8');
const CHAT_API_JS = fs.readFileSync(path.join(ROOT, 'shared/js/ChatApiClient.js'), 'utf8');
const CLIENTE_HTML = fs.readFileSync(path.join(ROOT, 'apps/cliente/index.html'), 'utf8');
const PRO_HTML = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');
const COMPONENTS_CSS = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

describe('MensalidadeInterestService', () => {
  test('usa BFF interna de mensalidade e nao WhatsApp externo', () => {
    assert.match(SERVICE_JS, /class MensalidadeInterestService/);
    assert.match(SERVICE_JS, /BffApiService\.barbearias\.enviarInteresseMensalidade/);
    assert.match(SERVICE_JS, /AuthGuard\.permitirAcao\('mensagem'/);
    assert.doesNotMatch(SERVICE_JS, /wa\.me|window\.open|target="_blank"/);
  });

  test('controla clique duplo com estado de envio e reabilita em erro', () => {
    assert.match(SERVICE_JS, /#emEnvio = new Set\(\)/);
    assert.match(SERVICE_JS, /btn\.disabled = true/);
    assert.match(SERVICE_JS, /Enviando\.\.\./);
    assert.match(SERVICE_JS, /finally[\s\S]*btn\.disabled = false/);
  });

  test('permite enviar interesse sem forcar a abertura do chat', () => {
    assert.match(SERVICE_JS, /abrirConversa = true/);
    assert.match(SERVICE_JS, /if \(!abrirConversa\) return/);
  });

  test('BarbeariaPage renderiza as duas acoes internas no card da mensalidade', () => {
    const inicio = BARBEARIA_JS.lastIndexOf('#abrirMensalModal(preco, msgRaw, shop)');
    const bloco = BARBEARIA_JS.slice(
      inicio,
      BARBEARIA_JS.indexOf('\n  #fecharMensalModal(', inicio),
    );
    assert.match(bloco, /class="bp-mensal-modal-card"/);
    assert.match(bloco, /class="bp-mensal-modal-acoes"/);
    assert.match(bloco, /class="btn btn-outline btn-full bp-mensal-modal-chat"[^>]*>Entrar no chat<\/button>/);
    assert.match(bloco, /class="btn btn-gold btn-full bp-mensal-modal-interesse"[^>]*>Enviar interesse<\/button>/);
    assert.equal((bloco.match(/<button /g) ?? []).length, 3, 'modal deve ter fechar e exatamente duas acoes');
    assert.match(bloco, /ConversationRepository\.buscarOuCriar\(shop\?\.owner_id\)/);
    assert.match(bloco, /MessagesWidget\.abrirConversaPersistida/);
    assert.match(bloco, /MensalidadeInterestService\.enviar/);
    assert.match(bloco, /abrirConversa:\s*false/);
    assert.doesNotMatch(bloco, /wa\.me|whatsHref|target="_blank"/);
  });

  test('modal mensal usa superficie do app e nao mantem CTA verde isolado', () => {
    const inicio = COMPONENTS_CSS.indexOf('.bp-mensal-modal-card');
    const fim = COMPONENTS_CSS.indexOf('/*', inicio + 1);
    const bloco = COMPONENTS_CSS.slice(inicio, fim);

    assert.match(bloco, /max-width:\s*440px/);
    assert.match(bloco, /border:\s*1px solid var\(--border/);
    assert.doesNotMatch(COMPONENTS_CSS, /\.bp-mensal-modal-cta[\s\S]*background:\s*#25D366/);
  });

  test('BffApiService expõe endpoint interno de interesse da mensalidade', () => {
    assert.match(BFF_JS, /enviarInteresseMensalidade:\s*\(barbershopId, payload\)/);
    assert.match(BFF_JS, /\/api\/v1\/barbearias\/\$\{encodeURIComponent\(barbershopId\)\}\/mensalidade\/interesse/);
  });

  test('MessagesWidget consegue abrir conversa persistida pelo conversationId', () => {
    assert.match(MESSAGES_JS, /abrirConversaPersistida/);
    assert.match(MESSAGES_JS, /UniversalChatPage\.abrirModal\(conversationId\)/);
    assert.match(UNIVERSAL_CHAT_JS, /static async abrirModal\(convId\)/);
    assert.match(UNIVERSAL_CHAT_JS, /ChatModal\.abrir\(\{[\s\S]*convId/);
    assert.match(CHAT_MODAL_JS, /ChatApiClient\.listarMensagens\(convId/);
    assert.match(CHAT_MODAL_JS, /textContent = texto/);
    assert.match(CHAT_API_JS, /\/api\/v1\/chat\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/messages/);
  });

  test('script compartilhado entra antes de BarbeariaPage nos dois apps', () => {
    for (const html of [CLIENTE_HTML, PRO_HTML]) {
      const idxService = html.indexOf('/shared/js/MensalidadeInterestService.js');
      const idxPage = html.indexOf('/shared/js/BarbeariaPage.js');
      assert.ok(idxService > 0, 'script do service deve existir');
      assert.ok(idxService < idxPage, 'service deve carregar antes da BarbeariaPage');
    }
  });
});
