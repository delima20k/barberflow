'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const root = path.resolve(__dirname, '..');

const lojaMarkerSrc = fs.readFileSync(path.join(root, 'shared/js/LojaMarker.js'), 'utf8');
const LojaMarker    = new Function(`${lojaMarkerSrc}; return LojaMarker;`)();

test('LojaMarker define classe com metodo html() estatico e geometria Leaflet', () => {
  assert.strictEqual(typeof LojaMarker, 'function');
  assert.strictEqual(typeof LojaMarker.html, 'function');
  assert.ok(Array.isArray(LojaMarker.ICON_SIZE)    && LojaMarker.ICON_SIZE.length    === 2);
  assert.ok(Array.isArray(LojaMarker.ICON_ANCHOR)  && LojaMarker.ICON_ANCHOR.length  === 2);
  assert.ok(Array.isArray(LojaMarker.POPUP_ANCHOR) && LojaMarker.POPUP_ANCHOR.length === 2);
});

test('LojaMarker.html() gera moldura dourada com imagem de capa da barbearia', () => {
  const html = LojaMarker.html({
    nomeCurto:    'Barber Test',
    iniciais:     'BT',
    avatarUrl:    'https://example.com/img.jpg',
    nomeEndereco: '42',
    isOpen:       true,
  });

  assert.ok(html.includes('loja-marker__frame'),      'deve ter frame dourado');
  assert.ok(html.includes('loja-marker__img'),        'deve ter imagem');
  assert.ok(html.includes('Barber Test'),             'deve incluir nome');
  assert.ok(html.includes('BT'),                      'deve incluir iniciais');
  assert.ok(html.includes('display:none'),            'iniciais ocultas quando avatar presente');
  assert.ok(html.includes('N&ordm; 42'),              'deve incluir numero do endereco');
  assert.ok(html.includes('aberta'),                  'deve incluir status aberta');
  assert.ok(html.includes('loja-marker__store-name'), 'deve ter label de nome no topo');
  assert.ok(html.includes('loja-marker__building'),   'deve ter bloco de edificio');
  assert.ok(html.includes('loja-marker__roof'),       'deve ter telhado');
  assert.ok(!html.includes('mapa-shop-pin.webp'),     'nao deve referenciar o webp legado');
});

test('LojaMarker.html() usa iniciais quando avatarUrl ausente', () => {
  const html = LojaMarker.html({
    nomeCurto:    'Barbearia',
    iniciais:     'BA',
    avatarUrl:    null,
    nomeEndereco: '',
    isOpen:       false,
  });

  assert.ok(!html.includes('loja-marker__img'), 'sem img quando avatarUrl e null');
  assert.ok(!html.includes('display:none'),     'iniciais visiveis sem avatar');
  assert.ok(html.includes('fechado'),           'deve incluir status fechado');
  assert.ok(!html.includes('N&ordm;'),          'sem numero quando ausente');
});

test('LojaMarker nao depende de mapa-shop-pin.webp', () => {
  const src = fs.readFileSync(path.join(root, 'shared/js/LojaMarker.js'), 'utf8');
  assert.ok(!src.includes('mapa-shop-pin.webp'), 'deve ser componente HTML/CSS puro');
});

test('LojaMarker CSS define frame dourado com object-fit cover', () => {
  const css = fs.readFileSync(path.join(root, 'shared/css/map-card.css'), 'utf8');
  assert.ok(css.includes('.loja-marker__frame'),    'deve definir frame');
  assert.ok(css.includes('.loja-marker__building'), 'deve definir building');
  assert.ok(css.includes('.loja-marker__roof'),     'deve definir roof');
  assert.ok(css.includes('object-fit: cover'),      'imagem usa object-fit cover');
  assert.ok(css.includes('#ffbf00'),                'borda dourada presente');
});
