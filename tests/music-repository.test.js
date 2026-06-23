'use strict';

// Testes do MusicRepository — valida/sanitiza só os 4 campos; bloqueia URL/áudio/script.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicRepository } = require('../shared/js/MusicRepository');

function stubService() {
  let musica = null;
  return { definirMusica(m) { musica = m; return m; }, removerMusica() { musica = null; }, get musica() { return musica; } };
}
const ref = (o = {}) => ({ music_id: 'aeris-andromeda-ab12', music_name: 'Aeris - Andromeda', duration: 35, genre: 'LoFi', ...o });

test('validar() devolve só os 4 campos (descarta url/artist/extras)', () => {
  const out = MusicRepository.validar({ ...ref(), url: 'https://r2/x.m4a', artist: 'Aeris', blob: 'x' });
  assert.deepEqual(out, { music_id: 'aeris-andromeda-ab12', music_name: 'Aeris - Andromeda', music_duration: 35, genre: 'LoFi' });
});

test('validar() bloqueia URL/áudio remoto/base64/script', () => {
  assert.throws(() => MusicRepository.validar(ref({ music_name: 'http://evil/a.mp3' })), /não permitido/);
  assert.throws(() => MusicRepository.validar(ref({ music_name: 'data:audio/mp3;base64,AAAA' })), /não permitido/);
  assert.throws(() => MusicRepository.validar(ref({ music_id: 'blob:1234' })), /não permitido|music_id/);
  assert.throws(() => MusicRepository.validar(ref({ music_name: '<script>x</script>' })), /não permitido/);
});

test('validar() normaliza music_id com chars inválidos e usa fallback em genre/duration', () => {
  // ID com chars inválidos (maiúsculas, espaços) é sanitizado — não bloqueia
  const r1 = MusicRepository.validar(ref({ music_id: 'A B C' }));
  assert.equal(r1.music_id, 'a-b-c');

  // Gênero desconhecido → fallback 'Todos' (não bloqueia seleção de música)
  const r2 = MusicRepository.validar(ref({ genre: 'Sertanejo' }));
  assert.equal(r2.genre, 'Todos');

  // Duração inválida → fallback 30 s
  const r3 = MusicRepository.validar(ref({ duration: 0 }));
  assert.equal(r3.music_duration, 30);
  const r4 = MusicRepository.validar(ref({ duration: 9999 }));
  assert.equal(r4.music_duration, 30);

  // music_id vazio/irreparável ainda rejeita
  assert.throws(() => MusicRepository.validar(ref({ music_id: '' })), /music_id/);
});

test('salvar() grava só a referência; obter() devolve 4 campos; limpar() remove', () => {
  const service = stubService();
  const repo = new MusicRepository({ service });
  const saved = repo.salvar({ ...ref(), url: 'https://r2/x.m4a' });
  assert.equal(saved.url, undefined, 'sem url');
  assert.deepEqual(repo.obter(), { music_id: 'aeris-andromeda-ab12', music_name: 'Aeris - Andromeda', music_duration: 35, genre: 'LoFi' });
  repo.limpar();
  assert.equal(repo.obter(), null);
});
