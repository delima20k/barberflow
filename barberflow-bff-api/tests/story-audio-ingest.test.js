'use strict';

// Testes da ingestão de áudios de story (classes puras + reader + processor stub).

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { AudioTrackNameParser }     = require('../application/stories/audio/AudioTrackNameParser');
const { GenreClassifier }          = require('../application/stories/audio/GenreClassifier');
const { StoryAudioR2Pather }       = require('../application/stories/audio/StoryAudioR2Pather');
const { StoryAudioCatalogBuilder } = require('../application/stories/audio/StoryAudioCatalogBuilder');
const { StoryAudioCatalogReader }  = require('../application/stories/audio/StoryAudioCatalogReader');
const { MusicProcessingService }   = require('../infrastructure/media/MusicProcessingService');

// ── AudioTrackNameParser ─────────────────────────────────────
test('AudioTrackNameParser limpa provedor e índice de duplicata', () => {
  assert.deepEqual(
    AudioTrackNameParser.parse('Aeris - Andromeda (freetouse.com).mp3'),
    { artist: 'Aeris', title: 'Andromeda', name: 'Aeris - Andromeda' });
  assert.equal(AudioTrackNameParser.parse('Aeris - Andromeda (freetouse.com) (1).mp3').name, 'Aeris - Andromeda');
  assert.equal(AudioTrackNameParser.parse('Bad Ideas Distressed - Kevin MacLeod.mp3').artist, 'Bad Ideas Distressed');
});

// ── GenreClassifier ──────────────────────────────────────────
test('GenreClassifier classifica por palavra-chave e cai no default', () => {
  assert.equal(GenreClassifier.classificar({ artist: 'Aylex', title: 'ANIME' }), 'Anime');
  assert.equal(GenreClassifier.classificar({ artist: 'X', title: 'Lo-Fi Study' }), 'LoFi');
  assert.equal(GenreClassifier.classificar({ artist: 'X', title: 'Epic Battle Glory' }), 'Épica');
  assert.equal(GenreClassifier.classificar({ artist: 'X', title: 'Nada disso' }), GenreClassifier.DEFAULT);
});

// ── StoryAudioR2Pather ───────────────────────────────────────
test('StoryAudioR2Pather monta keys sob stories/audio e remove acentos', () => {
  assert.equal(StoryAudioR2Pather.slug('Eletrônica Épica!'), 'eletronica-epica');
  assert.equal(
    StoryAudioR2Pather.keyFor({ genre: 'LoFi', musicId: 'aeris-andromeda-ab12', ext: '.m4a' }),
    'stories/audio/lofi/aeris-andromeda-ab12.m4a');
  assert.equal(StoryAudioR2Pather.catalogKey(), 'stories/audio/catalog.json');
});

// ── StoryAudioCatalogBuilder ─────────────────────────────────
test('StoryAudioCatalogBuilder monta catálogo, filtra sem url e ordena gêneros', () => {
  const cat = StoryAudioCatalogBuilder.montar([
    { music_id: 'a', music_name: 'A', artist: 'X', duration: 35, genre: 'Rock', size: 100, url: 'u1', ext: 'm4a' },
    { music_id: 'b', music_name: 'B', artist: 'Y', duration: 20, genre: 'Pop', size: 50, url: 'u2', ext: 'm4a' },
    { music_id: 'semurl', music_name: 'Z', genre: 'Pop' }, // sem url → descartada
  ], { now: () => new Date('2026-06-22T00:00:00Z') });

  assert.equal(cat.count, 2);
  assert.equal(cat.generatedAt, '2026-06-22T00:00:00.000Z');
  assert.deepEqual(cat.genres, ['Todos', 'Pop', 'Rock']); // ordem oficial, só presentes
  assert.equal(cat.tracks.length, 2);
});

// ── StoryAudioCatalogReader ──────────────────────────────────
test('StoryAudioCatalogReader lê do R2 e cacheia (TTL)', async () => {
  let downloads = 0;
  const catalogo = { generatedAt: 'x', count: 1, genres: ['Todos', 'Pop'], tracks: [{ music_id: 'a', url: 'u' }] };
  const r2 = { downloadSource: async () => { downloads += 1; return Buffer.from(JSON.stringify(catalogo)); } };
  const reader = new StoryAudioCatalogReader({ r2Gateway: r2, ttlMs: 10_000 });

  const a = await reader.ler();
  const b = await reader.ler();
  assert.equal(downloads, 1, 'segunda leitura usa cache');
  assert.equal(a.count, 1);
  assert.equal(b.tracks[0].music_id, 'a');
});

test('StoryAudioCatalogReader devolve vazio quando R2 indisponível/inexistente', async () => {
  const r2 = { downloadSource: async () => { throw new Error('NotFound'); } };
  const reader = new StoryAudioCatalogReader({ r2Gateway: r2 });
  const cat = await reader.ler();
  assert.equal(cat.count, 0);
  assert.deepEqual(cat.genres, ['Todos']);
});

// ── MusicProcessingService (runner stub, sem ffmpeg) ─────────
test('MusicProcessingService usa runner, clampa kbps (64–96) e formata resultado', async () => {
  let opcoesRecebidas = null;
  const runner = {
    run: async (buf, opts) => { opcoesRecebidas = opts; return { bytes: Buffer.from('aac-data'), ext: 'm4a', codec: 'aac' }; },
  };
  const svc = new MusicProcessingService({ runner });
  const out = await svc.process(Buffer.from('original-bytes'), { maxSeconds: 35, targetKbps: 500 });

  assert.equal(opcoesRecebidas.maxSeconds, 35);
  assert.equal(opcoesRecebidas.targetKbps, 96, 'kbps clampado ao máximo');
  assert.equal(opcoesRecebidas.codec, 'aac');
  assert.equal(out.contentType, 'audio/mp4');
  assert.equal(out.ext, 'm4a');
  assert.equal(out.originalBytes, Buffer.from('original-bytes').length);
  assert.equal(out.outputBytes, Buffer.from('aac-data').length);
});

test('MusicProcessingService.process rejeita buffer vazio', async () => {
  const svc = new MusicProcessingService({ runner: { run: async () => ({ bytes: Buffer.from('x') }) } });
  await assert.rejects(() => svc.process(Buffer.alloc(0)), /Buffer nao vazio/);
});

test('StoryAudioCatalogReader lista pagina filtrada sem devolver catalogo inteiro', async () => {
  const tracks = Array.from({ length: 55 }, (_, i) => ({
    music_id: `id-${i}`,
    music_name: `Faixa ${i}`,
    artist: i % 5 === 0 ? 'Aylex' : 'Outro',
    duration: 30,
    genre: i % 2 === 0 ? 'Rock' : 'Pop',
    url: `https://cdn/${i}.m4a`,
  }));
  const catalogo = { generatedAt: 'x', count: tracks.length, genres: ['Todos', 'Pop', 'Rock'], tracks };
  const r2 = { downloadSource: async () => Buffer.from(JSON.stringify(catalogo)) };
  const reader = new StoryAudioCatalogReader({ r2Gateway: r2 });

  const pagina = await reader.listarPagina({ page: 1, pageSize: 3, genre: 'Rock', q: 'aylex' });

  assert.equal(pagina.page, 1);
  assert.equal(pagina.pageSize, 3);
  assert.ok(pagina.tracks.length <= 3);
  assert.ok(pagina.count > pagina.tracks.length, 'count reflete total filtrado, nao so pagina');
  assert.ok(pagina.tracks.every(t => t.genre === 'Rock' && `${t.music_name} ${t.artist}`.toLowerCase().includes('aylex')));
});
