'use strict';

// Testes do mix de áudio: StoryComposer.planoAudio (puro) e StoryEditorService.audioMix.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { StoryComposer } = require('../shared/js/StoryCreationModal');
const { StoryEditorService } = require('../shared/js/StoryEditorService');

test('planoAudio: sem música → só original em volume cheio', () => {
  const p = StoryComposer.planoAudio({ musica: null, musicaSrc: null, audioMix: null });
  assert.deepEqual(p, { usarOriginal: true, volVideo: 1, usarMusica: false, volMusica: 0 });
});

test('planoAudio: música com src + manter original → mixa os dois', () => {
  const p = StoryComposer.planoAudio({
    musica: { id: 'm' }, musicaSrc: 'x.m4a',
    audioMix: { manterOriginal: true, volumeVideo: 0.4, volumeMusica: 0.9 },
  });
  assert.equal(p.usarOriginal, true);
  assert.equal(p.volVideo, 0.4);
  assert.equal(p.usarMusica, true);
  assert.equal(p.volMusica, 0.9);
});

test('planoAudio: remover original + música → só música', () => {
  const p = StoryComposer.planoAudio({
    musica: { id: 'm' }, musicaSrc: 'x.m4a',
    audioMix: { manterOriginal: false, volumeVideo: 1, volumeMusica: 0.7 },
  });
  assert.equal(p.usarOriginal, false);
  assert.equal(p.volVideo, 0);
  assert.equal(p.usarMusica, true);
});

test('planoAudio: música escolhida SEM src → não usa música (silêncio dessa faixa)', () => {
  const p = StoryComposer.planoAudio({ musica: { id: 'm' }, musicaSrc: null, audioMix: { manterOriginal: false } });
  assert.equal(p.usarMusica, false);
  assert.equal(p.usarOriginal, false);
});

test('StoryEditorService.audioMix: defaults e clamp', () => {
  const svc = new StoryEditorService();
  assert.deepEqual(svc.audioMix, { manterOriginal: true, volumeVideo: 1, volumeMusica: 0.7 });

  svc.definirMixAudio({ manterOriginal: false, volumeVideo: 2, volumeMusica: -1 });
  assert.deepEqual(svc.audioMix, { manterOriginal: false, volumeVideo: 1, volumeMusica: 0 });

  // merge parcial preserva o resto
  svc.definirMixAudio({ volumeMusica: 0.5 });
  assert.equal(svc.audioMix.volumeMusica, 0.5);
  assert.equal(svc.audioMix.manterOriginal, false);

  assert.equal('audioMix' in svc.estado, true);
  svc.resetar();
  assert.deepEqual(svc.audioMix, { manterOriginal: true, volumeVideo: 1, volumeMusica: 0.7 });
});

test('StoryEditorService.estado expoe aliases locais do preview de audio', () => {
  const svc = new StoryEditorService();
  svc.definirMixAudio({ keepOriginalAudio: false, videoVolume: 0.8, musicVolume: 0.4 });

  assert.equal(svc.estado.keepOriginalAudio, false);
  assert.equal(svc.estado.videoVolume, 0.8);
  assert.equal(svc.estado.musicVolume, 0.4);
});
