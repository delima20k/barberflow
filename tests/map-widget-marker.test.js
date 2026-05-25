'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('MapWidget usa marcador visual de barbearia com imagem do salao', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');

  // MapWidget delega HTML do marcador ao LojaMarker
  assert.match(js, /LojaMarker\.html/);
  assert.match(js, /LojaMarker\.ICON_SIZE/);
  assert.match(js, /LojaMarker\.ICON_ANCHOR/);
  assert.match(js, /logo_path/);
  assert.match(js, /recarregarBarbearias/);
  assert.match(js, /BarbeariaApiClient\.getTodas/);
  assert.doesNotMatch(js, /ApiService\.from\('barbershops'\)/);
  assert.doesNotMatch(js, /mapa-shop-pin\.webp/);

  // CSS mantém classes legadas + novas loja-marker__*
  assert.match(css, /\.mapa-shop-marker\b/);
  assert.match(css, /\.mapa-shop-marker__body\b/);
  assert.match(css, /\.loja-marker__frame\b/);
  assert.match(css, /\.loja-marker__building\b/);
  assert.doesNotMatch(css, /\.mapa-shop-marker__roof\b/);
});

test('MapWidget exibe icone de loja com nome e numero do endereco no marcador', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');

  assert.match(js, /#numeroEndereco/);
  assert.match(js, /numeroEnderecoSeguro/);
  assert.match(js, /#textoCurto/);
  assert.match(js, /nomeCurtoSeguro/);
  assert.match(js, /LojaMarker\.html/);
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

test('MapWidget invalida cache antes de recarregar barbearias do mapa', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const idx = js.indexOf('static async recarregarBarbearias');
  assert.ok(idx > 0, 'recarregarBarbearias deve existir');

  const bloco = js.slice(idx, idx + 500);
  assert.match(bloco, /BarbeariaApiClient\.invalidarCache\?\.\(\)/);
  assert.ok(
    bloco.indexOf('BarbeariaApiClient.invalidarCache') < bloco.indexOf('if (!MapWidget.#mapa) return'),
    'cache deve ser invalidado mesmo quando o mapa ainda nao foi inicializado',
  );
  assert.ok(
    bloco.indexOf('BarbeariaApiClient.invalidarCache') < bloco.indexOf('#carregarBarbeariasGlobais'),
    'cache deve ser invalidado antes de renderizar lista global',
  );
  assert.ok(
    bloco.indexOf('BarbeariaApiClient.invalidarCache') < bloco.indexOf('#carregar()'),
    'cache deve ser invalidado antes de renderizar lista com GPS',
  );
});

test('MapWidget mostra barbearias globais quando GPS falha ou vem invalido', () => {
  const js = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const idx = js.indexOf('static async #carregar');
  assert.ok(idx > 0, '#carregar deve existir');

  const bloco = js.slice(idx, idx + 900);
  assert.match(bloco, /!pos \|\| !isFinite\(pos\.lat\) \|\| !isFinite\(pos\.lng\)/);
  assert.match(bloco, /await MapWidget\.#carregarBarbeariasGlobais\(\)/);
  assert.match(bloco, /catch \(err\)/);
  assert.match(bloco, /MapWidget\.#exibirFAB\(err\?\.message\)/);
});

test('MapWidget usa marcador premium escuro e animado, sem avatar redondo padrao', () => {
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');
  const imgRuleStart = css.indexOf('.mapa-shop-marker__img');
  const imgRule = css.slice(imgRuleStart, css.indexOf('}', imgRuleStart));

  assert.match(css, /#0F1115/);
  assert.match(css, /#FFFFFF/);
  assert.match(css, /@keyframes mapa-shop-marker-enter/);
  assert.match(css, /animation: mapa-shop-marker-enter/);
  assert.match(css, /border-radius: 4px/);
  assert.doesNotMatch(imgRule, /border-radius:\s*50%/);
});

test('MapWidget exibe label de nome premium da barbearia acima do marcador no mapa', () => {
  const js  = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');

  // MapWidget delega ao LojaMarker que gera o store-name
  assert.match(js, /LojaMarker\.html/);
  // JS: usa cover_path como imagem principal, com fallback para logo_path
  assert.match(js, /cover_path/);
  assert.match(js, /logo_path/);

  // CSS: regras premium de nome presentes (legado mapa-shop + novo loja-marker)
  assert.match(css, /\.mapa-shop-marker__store-name\b/);
  assert.match(css, /\.loja-marker__store-name\b/);
  assert.match(css, /backdrop-filter/);
  assert.match(css, /#ffbf00/);
  assert.match(css, /rgba\(0,\s*0,\s*0/);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /pointer-events:\s*none/);
});

test('Service workers entregam scripts atuais do mapa no cliente e profissional', () => {
  const clienteSw = fs.readFileSync(path.join(root, 'apps/cliente/sw.js'), 'utf8');
  const proSw = fs.readFileSync(path.join(root, 'apps/profissional/sw.js'), 'utf8');
  const assetsMapa = [
    '/shared/js/BarbeariaApiClient.js',
    '/shared/js/GeoService.js',
    '/shared/js/MapWidget.js',
    '/shared/js/NearbyBarbershopsWidget.js',
  ];

  assert.doesNotMatch(clienteSw, /SW_CLI_VERSION = '20260517/);
  assert.doesNotMatch(proSw, /SW_PRO_VERSION = '20260517/);

  for (const asset of assetsMapa) {
    assert.ok(clienteSw.includes(asset), `cliente deve cachear ${asset}`);
    assert.ok(proSw.includes(asset), `profissional deve cachear ${asset}`);
  }
});
