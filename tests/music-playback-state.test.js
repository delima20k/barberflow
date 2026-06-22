'use strict';

// Testes do MusicPlaybackState — seleção, preview (cap 30s), limpar, progresso.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicPlaybackState } = require('../shared/js/MusicPlaybackState');

const track = (over = {}) => ({ music_id: 'a', music_name: 'A', artist: 'X', duration: 50, url: 'u', ...over });

test('selecionar/aplicarPreview definem seleção e duração (cap 30s)', () => {
  const s = new MusicPlaybackState();
  assert.equal(s.temSelecao, false);
  s.selecionar(track());
  s.aplicarPreview(track());
  assert.equal(s.temSelecao, true);
  assert.equal(s.selectedMusic.music_id, 'a');
  assert.equal(s.previewMusic.music_id, 'a');
  assert.equal(s.previewDuration, 30, 'cap em 30s mesmo com faixa de 50s');
});

test('aplicarPreview preserva duração menor que 30s', () => {
  const s = new MusicPlaybackState();
  s.aplicarPreview(track({ duration: 18 }));
  assert.equal(s.previewDuration, 18);
});

test('limpar() remove seleção e preview (cancelar)', () => {
  const s = new MusicPlaybackState();
  s.selecionar(track()); s.aplicarPreview(track());
  s.limpar();
  assert.equal(s.temSelecao, false);
  assert.equal(s.selectedMusic, null);
  assert.equal(s.previewMusic, null);
  assert.equal(s.previewDuration, 0);
});

test('setProgresso atualiza tempo/duração/playing e toJSON reflete', () => {
  const s = new MusicPlaybackState();
  s.setProgresso({ currentTime: 5, duration: 30, playing: true, id: 'a' });
  assert.equal(s.currentTime, 5);
  assert.equal(s.duration, 30);
  assert.equal(s.playing, true);
  assert.equal(s.toJSON().currentId, 'a');
});

test('getters devolvem cópias (imutabilidade)', () => {
  const s = new MusicPlaybackState();
  s.selecionar(track());
  const a = s.selectedMusic; a.music_id = 'mutado';
  assert.equal(s.selectedMusic.music_id, 'a', 'mutar a cópia não afeta o estado');
});
