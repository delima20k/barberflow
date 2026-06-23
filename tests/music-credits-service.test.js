'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MusicCreditsService } = require('../shared/js/MusicCreditsService');

test('MusicCreditsService gera creditos com title/music_name e artist', () => {
  const svc = new MusicCreditsService();
  const text = svc.generate({ music_id: 'id-1', music_name: 'Andromeda', artist: 'Aetheric' });

  assert.match(text, /Música utilizada neste conteúdo:/);
  assert.match(text, /"Andromeda"/);
  assert.match(text, /Autor\/Artista:\nAetheric/);
  assert.match(text, /Este conteúdo utiliza áudio licenciado ou atribuído ao autor original/);
});

test('MusicCreditsService nao gera creditos sem artist ou titulo', () => {
  const svc = new MusicCreditsService();

  assert.equal(svc.generate({ music_name: 'Andromeda' }), null);
  assert.equal(svc.generate({ artist: 'Aetheric' }), null);
});

test('MusicCreditsService escapa HTML e preserva URL como texto', () => {
  const svc = new MusicCreditsService();
  const text = svc.generate({
    title: '<script>alert(1)</script> https://cdn.test/audio.mp3',
    artist: 'Aetheric <img src=x>',
  });

  assert.match(text, /&lt;script&gt;alert\(1\)&lt;\/script&gt; https:\/\/cdn\.test\/audio\.mp3/);
  assert.match(text, /Aetheric &lt;img src=x&gt;/);
});

test('MusicCreditsService cacheia por id ou artist::title', () => {
  const svc = new MusicCreditsService();
  const a = svc.generate({ id: 'track-1', title: 'One', artist: 'Artist' });
  const b = svc.generate({ id: 'track-1', title: 'Two', artist: 'Other' });
  const c = svc.generate({ title: 'Same', artist: 'Artist' });
  const d = svc.generate({ music_name: 'Same', artist: 'Artist' });

  assert.equal(a, b);
  assert.equal(c, d);
});
