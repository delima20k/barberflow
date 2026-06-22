'use strict';

// Testes do MusicSelectionController — usar (confirma via stateManager + aplica) e cancelar.
// Usa MusicStateManager + MusicRepository reais sobre um StoryEditorService stub.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicSelectionController } = require('../shared/js/MusicSelectionController');
const { MusicStateManager } = require('../shared/js/MusicStateManager');
const { MusicPlaybackState } = require('../shared/js/MusicPlaybackState');
const { MusicRepository } = require('../shared/js/MusicRepository');

function stubPlayer() {
  return { _toca: [], _pausas: 0, tocar(t) { this._toca.push(t); }, pausar() { this._pausas += 1; } };
}
function stubService() {
  let musica = null;
  return {
    _def: [], _rem: 0,
    definirMusica(m) { this._def.push(m); musica = m; return m; },
    removerMusica() { this._rem += 1; musica = null; },
    get musica() { return musica; },
  };
}
function montar({ player = stubPlayer(), service = stubService(), onAplicar, onCancelar } = {}) {
  const state = new MusicPlaybackState();
  const repo = new MusicRepository({ service });
  const stateManager = new MusicStateManager({ state, repository: repo });
  const ctrl = new MusicSelectionController({ stateManager, player, onAplicar, onCancelar });
  return { ctrl, state, service, player };
}

// Faixa do catálogo (com url/artist que NÃO devem ser persistidos)
const track = { music_id: 'avanti-calling', music_name: 'Avanti - Calling', artist: 'Avanti', duration: 35, genre: 'Pop', url: 'https://r2/x.m4a' };

test('usar() confirma, persiste SÓ a referência (4 campos) e toca', () => {
  let aplicou = null;
  const { ctrl, state, service, player } = montar({ onAplicar: (t) => { aplicou = t; } });

  ctrl.usar(track);

  assert.equal(state.selectedMusic.music_id, 'avanti-calling');
  assert.equal(state.previewDuration, 30, 'preview cap 30s');
  assert.deepEqual(service._def[0], {
    music_id: 'avanti-calling', music_name: 'Avanti - Calling', music_duration: 35, genre: 'Pop',
  });
  assert.equal(service._def[0].url, undefined, 'NÃO persiste url/áudio');
  assert.equal(player._toca.length, 1, 'tocou no preview');
  assert.equal(aplicou.music_id, 'avanti-calling');
  assert.equal(ctrl.selecionada.music_id, 'avanti-calling');
});

test('usar() com referência insegura (url no nome) não quebra e não persiste', () => {
  const { ctrl, service } = montar();
  const r = ctrl.usar({ music_id: 'x', music_name: 'http://evil/a.mp3', duration: 10, genre: 'Pop' });
  assert.equal(r, null);
  assert.equal(service._def.length, 0, 'nada persistido');
});

test('cancelar() para a música, limpa estado e remove a referência', () => {
  let cancelou = false;
  const { ctrl, state, service, player } = montar({ onCancelar: () => { cancelou = true; } });
  ctrl.usar(track);
  ctrl.cancelar();

  assert.ok(player._pausas >= 1);
  assert.equal(state.temSelecao, false);
  assert.equal(service._rem, 1);
  assert.equal(cancelou, true);
  assert.equal(ctrl.selecionada, null);
});

test('seleção persiste (não é limpa sozinha após usar)', () => {
  const { ctrl } = montar();
  ctrl.usar(track);
  assert.equal(ctrl.selecionada.music_id, 'avanti-calling', 'mantém a referência');
});
