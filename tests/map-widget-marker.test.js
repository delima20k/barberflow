'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('MapWidget usa marcador visual de barbearia com imagem do salao', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');

  assert.match(js, /mapa-shop-marker/);
  assert.match(js, /mapa-shop-marker__roof/);
  assert.match(js, /mapa-shop-marker__img/);
  assert.match(js, /logo_path/);
  assert.match(js, /recarregarBarbearias/);
  assert.match(js, /BarbeariaApiClient\.getTodas/);
  assert.doesNotMatch(js, /ApiService\.from\('barbershops'\)/);

  assert.match(css, /\.mapa-shop-marker\b/);
  assert.match(css, /\.mapa-shop-marker__roof\b/);
  assert.match(css, /\.mapa-shop-marker__body\b/);
  assert.match(css, /\.mapa-shop-marker__img\b/);
});

test('MapWidget exibe casinha com nome e numero do endereco no marcador', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');

  assert.match(js, /#numeroEndereco/);
  assert.match(js, /numeroEnderecoSeguro/);
  assert.match(js, /mapa-shop-marker__roof/);
  assert.match(js, /mapa-shop-marker__label/);
  assert.match(js, /mapa-shop-marker__number/);

  assert.match(css, /\.mapa-shop-marker__roof\b/);
  assert.match(css, /\.mapa-shop-marker__label\b/);
  assert.match(css, /\.mapa-shop-marker__name\b/);
  assert.match(css, /\.mapa-shop-marker__number\b/);
});
