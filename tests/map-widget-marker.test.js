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
  assert.match(js, /mapa-shop-marker__bg/);
  assert.match(js, /mapa-shop-pin\.webp/);
  assert.match(js, /mapa-shop-marker__img/);
  assert.match(js, /logo_path/);
  assert.match(js, /recarregarBarbearias/);
  assert.match(js, /BarbeariaApiClient\.getTodas/);
  assert.doesNotMatch(js, /ApiService\.from\('barbershops'\)/);
  assert.doesNotMatch(js, /mapa-shop-marker__roof/);

  assert.match(css, /\.mapa-shop-marker\b/);
  assert.match(css, /\.mapa-shop-marker__bg\b/);
  assert.match(css, /\.mapa-shop-marker__body\b/);
  assert.match(css, /\.mapa-shop-marker__img\b/);
  assert.doesNotMatch(css, /\.mapa-shop-marker__roof\b/);
});

test('MapWidget exibe icone de loja com nome e numero do endereco no marcador', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');

  assert.match(js, /#numeroEndereco/);
  assert.match(js, /numeroEnderecoSeguro/);
  assert.match(js, /#textoCurto/);
  assert.match(js, /nomeCurtoSeguro/);
  assert.match(js, /mapa-shop-marker__bg/);
  assert.match(js, /mapa-shop-marker__label/);
  assert.match(js, /mapa-shop-marker__number/);
  assert.doesNotMatch(js, /mapa-shop-marker__addr/);
  assert.doesNotMatch(js, /mapa-shop-marker__roof/);

  assert.match(css, /\.mapa-shop-marker__bg\b/);
  assert.match(css, /\.mapa-shop-marker__label\b/);
  assert.match(css, /\.mapa-shop-marker__name\b/);
  assert.match(css, /\.mapa-shop-marker__number\b/);
});

test('MapWidget normaliza coordenadas validas sem descartar zero', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');

  assert.match(js, /#normalizarCoordenada/);
  assert.match(js, /#barbeariaComMapaValido/);
  assert.match(js, /Number\(s\.latitude\)/);
  assert.match(js, /Number\(s\.longitude\)/);
  assert.doesNotMatch(js, /s\.address && s\.latitude && s\.longitude/);
  assert.doesNotMatch(js, /if \(!b\.latitude \|\| !b\.longitude\) return/);
});

test('MapWidget usa marcador premium escuro e animado, sem avatar redondo padrao', () => {
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');
  const imgRuleStart = css.indexOf('.mapa-shop-marker__img');
  const imgRule = css.slice(imgRuleStart, css.indexOf('}', imgRuleStart));

  assert.match(css, /#0F1115/);
  assert.match(css, /#FFFFFF/);
  assert.match(css, /@keyframes mapa-shop-marker-enter/);
  assert.match(css, /animation: mapa-shop-marker-enter/);
  assert.match(css, /border-radius: 8px/);
  assert.doesNotMatch(imgRule, /border-radius:\s*50%/);
});
