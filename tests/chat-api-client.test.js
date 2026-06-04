'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'shared/js/ChatApiClient.js'), 'utf8');

describe('ChatApiClient — conversa lida', () => {
  test('expoe metodo para marcar conversa como lida pela BFF', () => {
    assert.ok(
      SRC.includes('static async marcarConversaComoLida('),
      'deve expor metodo dedicado para read state',
    );
  });

  test('usa PATCH no endpoint canonico da BFF', () => {
    assert.ok(SRC.includes('BffApiService.patch('), 'deve usar PATCH via BffApiService');
    assert.ok(
      SRC.includes('/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/read'),
      'deve chamar endpoint /conversations/:id/read',
    );
  });
});
