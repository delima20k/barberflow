'use strict';

// =============================================================
// messages-widget.test.js — contrato do MessagesWidget (shim).
//
// Contrato vigente (chat canônico na BFF — skill-06):
//   • MessagesWidget é um shim de retrocompatibilidade; NÃO acessa
//     dados diretamente (sem PostgREST, sem fetch, sem FK hints).
//     A lógica vive em UniversalChatPage / ChatModal.
//   • ChatApiClient é a única porta de dados do chat e fala
//     exclusivamente com a BFF (/api/v1/chat/*) via BffApiService.
//
// Substitui o contrato antigo de #buscarConversas em 2 etapas via
// PostgREST — removido quando o chat migrou para a BFF.
// =============================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_WIDGET = fs.readFileSync(path.join(ROOT, 'shared/js/MessagesWidget.js'), 'utf8');
const SRC_CHAT   = fs.readFileSync(path.join(ROOT, 'shared/js/ChatApiClient.js'), 'utf8');

// ─── Shim sem acesso direto a dados ─────────────────────────────────────────

describe('MessagesWidget — shim sem acesso direto a dados', () => {

  test('não consulta PostgREST diretamente (sem ApiService.from)', () => {
    assert.ok(
      !SRC_WIDGET.includes('ApiService.from'),
      'shim não deve ter queries PostgREST — dados de chat vêm da BFF',
    );
  });

  test('não usa fetch direto', () => {
    assert.ok(
      !/\bfetch\(/.test(SRC_WIDGET),
      'shim não deve usar fetch — acesso a dados é do ChatApiClient/BFF',
    );
  });

  test('não contém FK hints do PostgREST (causa histórica de 400)', () => {
    assert.ok(
      !SRC_WIDGET.includes('_fkey'),
      'FK hints (profiles!..._fkey) não devem voltar ao widget',
    );
  });

  test('não consulta appointments para montar conversas', () => {
    assert.ok(
      !SRC_WIDGET.includes("'appointments'"),
      'conversas não derivam mais de appointments no frontend',
    );
  });

  test('delega a lista de conversas para UniversalChatPage', () => {
    assert.ok(
      SRC_WIDGET.includes('UniversalChatPage.init'),
      'init() deve delegar para UniversalChatPage',
    );
  });
});

// ─── ChatApiClient fala somente com a BFF ───────────────────────────────────

describe('ChatApiClient — dados do chat vêm exclusivamente da BFF', () => {

  test('todas as rotas são /api/v1/chat/*', () => {
    const rotas = [...SRC_CHAT.matchAll(/['"`](\/api\/v1\/[^'"`]+)/g)].map(m => m[1]);
    assert.ok(rotas.length > 0, 'ChatApiClient deve declarar rotas da BFF');
    for (const rota of rotas) {
      assert.match(rota, /^\/api\/v1\/chat\//, `rota fora do namespace de chat: ${rota}`);
    }
  });

  test('usa BffApiService como transporte (sem fetch/PostgREST direto)', () => {
    assert.ok(SRC_CHAT.includes('BffApiService.'), 'transporte deve ser o BffApiService');
    assert.ok(!SRC_CHAT.includes('ApiService.from'), 'sem PostgREST direto no chat');
  });
});
