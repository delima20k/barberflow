'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('StoryViewer interacoes', () => {
  test('usa BFF para mensagens de stories e evita acesso direto ao Supabase legado', () => {
    const source = fs.readFileSync(path.join(ROOT, 'shared/js/StoryViewer.js'), 'utf8');

    assert.match(source, /BffApiService\.media\.listarStoryMessages/);
    assert.match(source, /BffApiService\.media\.enviarStoryMessage/);
    assert.match(source, /BffApiService\.media\.toggleStoryLike/);
    assert.match(source, /texto\.textContent = c\.body \?\? c\.content \?\? ''/);
    assert.doesNotMatch(source, /MessageService\.buscarComentariosStory/);
    assert.doesNotMatch(source, /MessageService\.enviarComentarioStory/);
    assert.doesNotMatch(source, /SupabaseService\.storyComments/);
  });

  test('mostra mensagens recebidas ao autor do story sem permitir autoenvio', () => {
    const source = fs.readFileSync(path.join(ROOT, 'shared/js/StoryViewer.js'), 'utf8');

    assert.match(source, /#usuarioAtualId\(\)/);
    assert.match(source, /isOwner:\s+Boolean\(story\.owner_id && StoryViewer\.#usuarioAtualId\(\) === story\.owner_id\)/);
    assert.match(source, /Ver mensagens do story/);
    assert.match(source, /mensagensInput\.hidden = dados\.isOwner/);
    assert.match(source, /if \(StoryViewer\.#storyAtualEhDoUsuario\(\)\) return;/);
  });
});
