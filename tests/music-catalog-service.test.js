'use strict';

// Testes do MusicCatalogService — filtro, paginação (20) e cache.
// Valida escala com catálogos sintéticos de 100/500/1000 faixas.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicCatalogService } = require('../shared/js/MusicCatalogService');

function fakeTracks(n) {
  const generos = ['Pop', 'Rock', 'LoFi'];
  return Array.from({ length: n }, (_, i) => ({
    music_id: `id-${i}`, music_name: `Faixa ${i}`, artist: i % 7 === 0 ? 'Aylex' : 'Outro',
    duration: 35, genre: generos[i % generos.length], url: `https://r2/${i}.m4a`, ext: 'm4a',
  }));
}

test('pagina() devolve no máximo 20 e é uma FATIA (mantém referências)', () => {
  const lista = fakeTracks(1000);
  const p1 = MusicCatalogService.pagina(lista, 1, 20);
  assert.equal(p1.length, 20);
  assert.equal(p1[0], lista[0], 'mesma referência → não copia o objeto');
  const p50 = MusicCatalogService.pagina(lista, 50, 20);
  assert.equal(p50.length, 20);
  assert.equal(p50[0], lista[980]);
  assert.equal(MusicCatalogService.pagina(lista, 51, 20).length, 0, 'além do fim → vazio');
});

for (const n of [100, 500, 1000]) {
  test(`escala: ${n} faixas — totalPaginas e filtro corretos`, () => {
    const lista = fakeTracks(n);
    assert.equal(MusicCatalogService.totalPaginas(n, 20), Math.ceil(n / 20));
    const rock = MusicCatalogService.filtrar(lista, { genero: 'Rock' });
    assert.ok(rock.every(t => t.genre === 'Rock'));
    assert.ok(rock.length > 0 && rock.length < n);
    // busca por termo
    const byTermo = MusicCatalogService.filtrar(lista, { termo: 'aylex' });
    assert.ok(byTermo.every(t => `${t.music_name} ${t.artist}`.toLowerCase().includes('aylex')));
  });
}

test('filtro Todos + termo vazio devolve tudo', () => {
  const lista = fakeTracks(100);
  assert.equal(MusicCatalogService.filtrar(lista, { genero: 'Todos', termo: '' }).length, 100);
});

test('carregar() busca via api, normaliza e cacheia (1 fetch)', async () => {
  let chamadas = 0;
  const cat = { generatedAt: 'x', count: 2, genres: ['Todos', 'Pop'], tracks: fakeTracks(2) };
  const api = { musicas: { catalogo: async () => { chamadas += 1; return { data: cat }; } } };
  const svc = new MusicCatalogService({ api });

  const a = await svc.carregar();
  const b = await svc.carregar();
  assert.equal(chamadas, 1, 'segunda chamada usa cache');
  assert.equal(a, b);
  assert.equal(svc.tracks.length, 2);
  assert.deepEqual(svc.generos(), ['Todos', 'Pop']);
});

test('carregar() degrada para vazio quando a api falha', async () => {
  const api = { musicas: { catalogo: async () => { throw new Error('rede'); } } };
  const svc = new MusicCatalogService({ api });
  await svc.carregar();
  assert.equal(svc.tracks.length, 0);
  assert.deepEqual(svc.generos(), ['Todos']);
});
