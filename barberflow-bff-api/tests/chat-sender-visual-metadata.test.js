'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REPO_JS = fs.readFileSync(path.join(ROOT, 'infrastructure/chat/SupabaseChatRepository.js'), 'utf8');

describe('SupabaseChatRepository sender visual metadata', () => {
  test('lista mensagens com metadados seguros do remetente', () => {
    assert.match(REPO_JS, /#enriquecerMensagensComRemetente/);
    assert.match(REPO_JS, /\.from\('profiles'\)/);
    assert.match(REPO_JS, /select\('id, full_name, avatar_path, role'\)/);
    assert.match(REPO_JS, /sender:\s*SupabaseChatRepository\./);
    assert.match(REPO_JS, /avatarPath/);
  });

  test('contexto de entrega realtime tambem inclui remetente', () => {
    assert.match(REPO_JS, /sender:\s*await this\.#buscarRemetente/);
    assert.match(REPO_JS, /findDeliveryContext/);
  });
});
