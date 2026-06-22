'use strict';

// Testes do AudioPreviewPlayer — instância única, toggle, para anterior, volume.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { AudioPreviewPlayer } = require('../shared/js/AudioPreviewPlayer');

function FakeAudioFactory() {
  let criados = 0;
  class FakeAudio {
    constructor() { criados += 1; this.src = ''; this.volume = 1; this.paused = true; this._l = {}; }
    addEventListener(ev, h) { (this._l[ev] ??= []).push(h); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  FakeAudio.criados = () => criados;
  return FakeAudio;
}

test('tocar/alternar reutiliza UM ÚNICO Audio', () => {
  const Fake = FakeAudioFactory();
  const p = new AudioPreviewPlayer({ AudioCtor: Fake });
  p.tocar('a.m4a');
  p.tocar('b.m4a');
  p.alternar('c.m4a');
  assert.equal(Fake.criados(), 1, 'um só elemento Audio para todas as faixas');
  assert.equal(p.url, 'c.m4a');
  assert.equal(p.tocando, true);
});

test('alternar a mesma faixa faz toggle (pausa)', () => {
  const Fake = FakeAudioFactory();
  const p = new AudioPreviewPlayer({ AudioCtor: Fake });
  p.alternar('a.m4a');
  assert.equal(p.tocando, true);
  p.alternar('a.m4a');
  assert.equal(p.tocando, false, 'segunda vez na mesma faixa pausa');
});

test('volume é clampado e aplicado ao elemento', () => {
  const Fake = FakeAudioFactory();
  const p = new AudioPreviewPlayer({ AudioCtor: Fake });
  p.tocar('a.m4a');
  p.volume = 2;   assert.equal(p.volume, 1);
  p.volume = -1;  assert.equal(p.volume, 0);
  p.volume = 0.5; assert.equal(p.volume, 0.5);
});

test('destruir libera o recurso e zera o estado', () => {
  const Fake = FakeAudioFactory();
  const p = new AudioPreviewPlayer({ AudioCtor: Fake });
  p.tocar('a.m4a');
  p.destruir();
  assert.equal(p.url, null);
  assert.equal(p.tocando, false);
});

test('sem AudioCtor não quebra (degrada)', () => {
  const p = new AudioPreviewPlayer({ AudioCtor: null });
  assert.equal(p.alternar('a.m4a'), false);
  assert.equal(p.tocando, false);
});
