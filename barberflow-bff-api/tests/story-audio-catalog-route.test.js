'use strict';

const express = require('express');
const http = require('node:http');
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_ENV = 'test';

const criarMediaRoute = require('../routes/media');

function createDbStub() {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    is: () => chain,
    lt: () => chain,
    lte: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve) => resolve({ data: [], error: null }),
  };
  return { from: () => chain, rpc: () => chain };
}

function request(server, path, { headers = {}, json = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: 'GET',
      headers,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json ? JSON.parse(raw) : raw,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function startServer(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}

test('catalogo de musicas de story nao exige Authorization e devolve pagina controlada', async () => {
  const chamadas = [];
  const audioCatalogReader = {
    listarPagina: async (params) => {
      chamadas.push(params);
      return {
        generatedAt: 'x',
        count: 2,
        genres: ['Todos', 'Pop'],
        tracks: [
          {
            music_id: 'id-1',
            music_name: 'Faixa 1',
            duration: 30,
            genre: 'Pop',
            key: 'stories/audio/pop/faixa-1.m4a',
            url: 'https://pub-9736.r2.dev/stories/audio/pop/faixa-1.m4a',
          },
        ],
        page: 1,
        pageSize: 20,
        totalPages: 1,
        hasMore: false,
      };
    },
  };
  const storage = {
    createSignedUpload: async () => ({}),
    createSignedAccess: async () => ({}),
  };
  const app = express();
  app.use('/api/v1/media', criarMediaRoute(createDbStub(), { audioCatalogReader, r2Instance: storage, storage }));
  const server = await startServer(app);

  try {
    const { status, body } = await request(server, '/api/v1/media/stories/audio/catalog?page=1&pageSize=20&genre=Todos&q=yu');

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.dados.tracks.length, 1);
    assert.equal(body.dados.tracks[0].music_id, 'id-1');
    assert.equal(body.dados.tracks[0].key, 'stories/audio/pop/faixa-1.m4a');
    assert.match(body.dados.tracks[0].url, /\/api\/v1\/media\/stories\/audio\/source\?key=stories%2Faudio%2Fpop%2Ffaixa-1\.m4a$/);
    assert.equal(body.dados.tracks[0].url.includes('r2.dev'), false);
    assert.deepEqual(chamadas[0], { page: '1', pageSize: '20', genre: 'Todos', q: 'yu' });
  } finally {
    await closeServer(server);
  }
});

test('source de audio de story serve pelo BFF com CORS e bloqueia key fora do prefixo', async () => {
  const downloads = [];
  const storage = {
    createSignedUpload: async () => ({}),
    createSignedAccess: async () => ({}),
    downloadSource: async (key) => {
      downloads.push(key);
      return Buffer.from('audio-bytes');
    },
  };
  const app = express();
  app.use('/api/v1/media', criarMediaRoute(createDbStub(), { r2Instance: storage, storage }));
  const server = await startServer(app);

  try {
    const ok = await request(server, '/api/v1/media/stories/audio/source?key=stories%2Faudio%2Fpop%2Ffaixa-1.m4a', {
      headers: { Origin: 'https://pro.berberflow.shop' },
      json: false,
    });

    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'audio-bytes');
    assert.equal(ok.headers['access-control-allow-origin'], 'https://pro.berberflow.shop');
    assert.equal(ok.headers['content-type'], 'audio/mp4');
    assert.deepEqual(downloads, ['stories/audio/pop/faixa-1.m4a']);

    const invalid = await request(server, '/api/v1/media/stories/audio/source?key=stories%2Fvideo.mp4');
    assert.equal(invalid.status, 400);
  } finally {
    await closeServer(server);
  }
});
