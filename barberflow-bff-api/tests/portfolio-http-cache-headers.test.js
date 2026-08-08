'use strict';

// ─────────────────────────────────────────────────────────────────
// Validação HTTP real (não apenas leitura de código) de que os
// endpoints de leitura de portfolio nao voltam a introduzir cache
// apos publicar uma foto. Sobe um servidor Express de verdade,
// com o CorsMiddleware real (que e quem define o Cache-Control
// "private, no-store" default), e injeta um service mockado nos
// controllers reais (BarbeariaController/ProfissionalController)
// para exercitar o caminho de sucesso sem depender de Supabase real.
// ─────────────────────────────────────────────────────────────────

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http    = require('node:http');
const express = require('express');

const CorsMiddleware       = require('../middlewares/cors');
const BarbeariaController  = require('../controllers/BarbeariaController');
const ProfissionalController = require('../controllers/ProfissionalController');

let server;
let port;

before(async () => {
  const app = express();
  app.use(CorsMiddleware.handle);

  const barbeariaController = new BarbeariaController({
    listarPortfolio: async () => ({ items: [{ id: 'img-1' }], total: 1 }),
  });
  app.get('/api/v1/barbearias/:barbershop_id/portfolio', (req, res) => barbeariaController.portfolio(req, res));

  const profissionalController = new ProfissionalController({
    listarPortfolioPublico: async () => ({ items: [{ id: 'img-2' }], total: 1 }),
  });
  app.get('/api/v1/profissionais/:id/portfolio', (req, res) => profissionalController.portfolio(req, res));

  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

suite('Portfolio HTTP — headers de cache (execução real, servidor Express real)', () => {

  test('GET /barbearias/:id/portfolio — resposta real não é cacheável (sem max-age)', async () => {
    const { status, headers } = await get(
      '/api/v1/barbearias/550e8400-e29b-41d4-a716-446655440000/portfolio',
      { Origin: 'https://pro.barberflow.live' },
    );
    assert.equal(status, 200);
    assert.equal(headers['cache-control'], 'private, no-store', 'nao pode conter max-age/stale-while-revalidate');
    assert.doesNotMatch(headers['cache-control'] ?? '', /max-age/);
  });

  test('GET /profissionais/:id/portfolio — resposta real não é cacheável (sem max-age)', async () => {
    const { status, headers } = await get(
      '/api/v1/profissionais/660e8400-e29b-41d4-a716-446655440001/portfolio',
      { Origin: 'https://pro.barberflow.live' },
    );
    assert.equal(status, 200);
    assert.equal(headers['cache-control'], 'private, no-store', 'nao pode conter max-age/stale-while-revalidate');
    assert.doesNotMatch(headers['cache-control'] ?? '', /max-age/);
  });

  test('duas requisições consecutivas ao mesmo path — resposta HTTP não instrui o navegador a reaproveitar cache', async () => {
    // Regressão do bug original: antes, o navegador podia servir a 2a chamada
    // do cache local sem sequer chegar aqui. Aqui validamos a garantia do lado
    // servidor (header), que é a causa raiz corrigida — o comportamento real
    // do cache do navegador em si só é observável em execução de browser real.
    const path = '/api/v1/barbearias/550e8400-e29b-41d4-a716-446655440000/portfolio';
    const r1 = await get(path);
    const r2 = await get(path);
    assert.equal(r1.headers['cache-control'], 'private, no-store');
    assert.equal(r2.headers['cache-control'], 'private, no-store');
  });
});
