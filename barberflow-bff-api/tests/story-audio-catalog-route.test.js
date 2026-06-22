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

function request(server, path, { headers = {} } = {}) {
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
        resolve({ status: res.statusCode, body: JSON.parse(raw) });
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
          { music_id: 'id-1', music_name: 'Faixa 1', duration: 30, genre: 'Pop', url: 'https://cdn/1.m4a' },
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
    assert.deepEqual(chamadas[0], { page: '1', pageSize: '20', genre: 'Todos', q: 'yu' });
  } finally {
    await closeServer(server);
  }
});
