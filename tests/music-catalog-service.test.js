'use strict';

// Testes do MusicCatalogService — filtro, paginação (20) e cache.
// Valida escala com catálogos sintéticos de 100/500/1000 faixas.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicCatalogService } = require('../shared/js/MusicCatalogService');
const { MusicCacheService } = require('../shared/js/MusicCacheService');

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

test('escala mobile: 5000 musicas filtram em <200ms e renderizam somente pagina de 20', () => {
  const lista = fakeTracks(5000);
  const inicio = Date.now();
  const filtrada = MusicCatalogService.filtrar(lista, { genero: 'Rock', termo: 'faixa' });
  const paginaMobile = MusicCatalogService.pagina(filtrada, 1, 20);
  const elapsedMs = Date.now() - inicio;

  assert.ok(elapsedMs < 200, `busca 5000 musicas demorou ${elapsedMs}ms`);
  assert.equal(paginaMobile.length, 20, 'UI mobile deve receber apenas a pagina visivel');
  assert.equal(paginaMobile[0], filtrada[0], 'pagina usa slice sem clonar os objetos');
});

test('memoria estavel: paginar 5000 musicas nao copia o catalogo inteiro', () => {
  const lista = fakeTracks(5000);
  const heapBefore = process.memoryUsage().heapUsed;

  for (let i = 1; i <= 250; i += 1) {
    const pagina = MusicCatalogService.pagina(lista, i, 20);
    assert.ok(pagina.length <= 20);
    if (pagina.length) assert.equal(pagina[0], lista[(i - 1) * 20]);
  }

  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  assert.ok(heapDeltaMb < 20, `crescimento de heap alto: ${heapDeltaMb.toFixed(2)}MB`);
});

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

test('offline parcial: carregar() usa catalogo stale expirado quando a rede falha', async () => {
  let agora = 0;
  const cache = new MusicCacheService({ ttlMs: 1000, now: () => agora });
  const cat = { generatedAt: 'x', count: 5000, genres: ['Todos', 'Pop'], tracks: fakeTracks(5000) };
  cache.set(MusicCatalogService.CACHE_KEY, cat);

  agora = 5000;
  const api = { musicas: { catalogo: async () => { throw new Error('offline'); } } };
  const svc = new MusicCatalogService({ api, cache });

  const carregado = await svc.carregar();
  assert.equal(carregado, cat, 'usa o ultimo catalogo conhecido mesmo expirado');
  assert.equal(svc.tracks.length, 5000);
  assert.deepEqual(svc.generos(), ['Todos', 'Pop']);
});

test('buscarPagina() envia filtros para a BFF e cacheia a pagina sob demanda', async () => {
  const chamadas = [];
  const api = {
    musicas: {
      catalogo: async (params) => {
        chamadas.push(params);
        return {
          data: {
            generatedAt: 'x',
            count: 40,
            genres: ['Todos', 'Rock'],
            tracks: fakeTracks(20).map(t => ({ ...t, genre: 'Rock' })),
            page: params.page,
            pageSize: params.pageSize,
            totalPages: 2,
            hasMore: true,
          },
        };
      },
    },
  };
  const svc = new MusicCatalogService({ api, cache: new MusicCacheService() });

  const a = await svc.buscarPagina({ genero: 'Rock', termo: 'aylex', pagina: 1, pageSize: 20 });
  const b = await svc.buscarPagina({ genero: 'Rock', termo: 'aylex', pagina: 1, pageSize: 20 });

  assert.equal(chamadas.length, 1, 'segunda chamada usa cache da pagina');
  assert.deepEqual(chamadas[0], { page: 1, pageSize: 20, genre: 'Rock', q: 'aylex' });
  assert.equal(a.tracks.length, 20);
  assert.equal(a.hasMore, true);
  assert.equal(b, a);
});

test('buscarPagina() faz fallback local quando a BFF antiga retorna catalogo completo', async () => {
  const cat = { generatedAt: 'x', count: 100, genres: ['Todos', 'Pop', 'Rock'], tracks: fakeTracks(100) };
  const api = { musicas: { catalogo: async () => ({ data: cat }) } };
  const svc = new MusicCatalogService({ api, cache: new MusicCacheService() });

  const pagina = await svc.buscarPagina({ genero: 'Rock', pagina: 2, pageSize: 20 });

  assert.equal(pagina.page, 2);
  assert.equal(pagina.pageSize, 20);
  assert.ok(pagina.tracks.every(t => t.genre === 'Rock'));
  assert.ok(pagina.tracks.length <= 20);
});
