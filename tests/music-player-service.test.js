'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MusicPlayerService } = require('../shared/js/MusicPlayerService');

function FakeAudioFactory() {
  const instances = [];
  class FakeAudio {
    constructor() {
      this.src = '';
      this.volume = 1;
      this.preload = '';
      this.currentTime = 0;
      this.duration = 30;
      this.paused = true;
      this.listeners = {};
      instances.push(this);
    }
    addEventListener(ev, handler) { (this.listeners[ev] ??= []).push(handler); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    emit(ev) { for (const h of this.listeners[ev] ?? []) h(); }
  }
  FakeAudio.instances = instances;
  return FakeAudio;
}

function track(i) {
  return {
    music_id: `id-${i}`,
    music_name: `Faixa ${i}`,
    artist: 'BarberFlow',
    duration: 45,
    url: `https://cdn.example.test/${i}.m4a`,
  };
}

test('MusicPlayerService toca 50 faixas reutilizando um unico Audio e parando a anterior', () => {
  const FakeAudio = FakeAudioFactory();
  const service = new MusicPlayerService({ AudioCtor: FakeAudio });

  for (let i = 0; i < 50; i += 1) {
    assert.equal(service.tocar(track(i)), true);
    assert.equal(service.currentId, `id-${i}`);
  }

  assert.equal(FakeAudio.instances.length, 1, 'nao acumula elementos Audio');
  assert.equal(FakeAudio.instances[0].src, 'https://cdn.example.test/49.m4a');
  assert.equal(service.tocando, true);
});

test('MusicPlayerService limita o preview a 30s e pausa ao atingir o limite', () => {
  const FakeAudio = FakeAudioFactory();
  const progress = [];
  const service = new MusicPlayerService({
    AudioCtor: FakeAudio,
    onProgress: (p) => progress.push(p),
  });

  service.tocar(track(1));
  FakeAudio.instances[0].currentTime = 31;
  FakeAudio.instances[0].duration = 45;
  FakeAudio.instances[0].emit('timeupdate');

  assert.equal(service.tocando, false);
  assert.equal(progress.at(-1).currentTime, 30);
  assert.equal(progress.at(-1).duration, 30);
});

test('MusicPlayerService permite sincronizar o tempo do audio com o video', () => {
  const FakeAudio = FakeAudioFactory();
  const service = new MusicPlayerService({ AudioCtor: FakeAudio });

  service.tocar(track(1));
  service.sincronizarTempo(12.4);

  assert.equal(FakeAudio.instances[0].currentTime, 12.4);
  assert.equal(service.currentTime, 12.4);
});
