'use strict';

// Testes do MusicStateManager — confirmar persiste só a referência; cancelar limpa.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicStateManager } = require('../shared/js/MusicStateManager');
const { MusicPlaybackState } = require('../shared/js/MusicPlaybackState');
const { MusicRepository } = require('../shared/js/MusicRepository');

function stubService() {
  let musica = null;
  return { definirMusica(m) { musica = m; return m; }, removerMusica() { musica = null; }, get musica() { return musica; } };
}
function montar() {
  const service = stubService();
  const state = new MusicPlaybackState();
  const repo = new MusicRepository({ service });
  return { mgr: new MusicStateManager({ state, repository: repo }), state, service };
}
const track = { music_id: 'avanti-calling', music_name: 'Avanti - Calling', artist: 'Avanti', duration: 35, genre: 'Pop', url: 'https://r2/x.m4a' };

test('confirmar() marca seleção/preview e persiste só a referência (4 campos)', () => {
  const { mgr, state, service } = montar();
  const ref = mgr.confirmar(track);

  assert.deepEqual(ref, { music_id: 'avanti-calling', music_name: 'Avanti - Calling', music_duration: 35, genre: 'Pop' });
  assert.equal(service.musica.url, undefined, 'não persiste url');
  assert.equal(state.selectedMusic.music_id, 'avanti-calling');
  assert.equal(state.previewDuration, 30);
  assert.deepEqual(mgr.selecionada(), ref);
});

test('preview() marca preview sem persistir', () => {
  const { mgr, service } = montar();
  mgr.preview(track);
  assert.equal(service.musica, null, 'preview não persiste');
  assert.equal(mgr.emPreview().music_id, 'avanti-calling');
});

test('cancelar() limpa estado e remove a referência', () => {
  const { mgr, state, service } = montar();
  mgr.confirmar(track);
  mgr.cancelar();
  assert.equal(state.temSelecao, false);
  assert.equal(service.musica, null);
  assert.equal(mgr.selecionada(), null);
});
