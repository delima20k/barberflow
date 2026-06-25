'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { BarbeariaSharePanel } = require('../shared/js/BarbeariaSharePanel');

const SHOP_ID = '30000000-0000-4000-8000-000000000003';

function criarElemento() {
  return { value: '', textContent: '', hidden: true, listeners: {},
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    focus() {}, select() {} };
}

function criarRoot() {
  const link    = criarElemento();
  const whats   = criarElemento();
  const copy    = criarElemento();
  const status  = criarElemento();
  const preview = criarElemento();
  const map = {
    '[data-mb-share-link]':    link,
    '[data-mb-share-whats]':   whats,
    '[data-mb-share-copy]':    copy,
    '[data-mb-share-status]':  status,
    '[data-mb-share-preview]': preview,
  };
  const root = { hidden: true, querySelector: (sel) => map[sel] ?? null, _els: map };
  return root;
}

const APP_URL = 'https://app.berberflow.shop';

test('atualizar com id válido revela o card e preenche o link do app cliente', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root).montar();

  panel.atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  assert.equal(root.hidden, false, 'section visível');
  assert.equal(
    root._els['[data-mb-share-link]'].value,
    `${APP_URL}/?barbearia=${SHOP_ID}`,
    'link aponta para o app cliente'
  );
});

test('atualizar sem id mantém o card oculto', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root).montar();

  panel.atualizar({ barbershopId: null, nome: 'X' });

  assert.equal(root.hidden, true);
});

test('link não contém domínio do BFF', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root).montar();
  panel.atualizar({ barbershopId: SHOP_ID, nome: 'X' });

  const link = root._els['[data-mb-share-link]'].value;
  assert.doesNotMatch(link, /bff\.berberflow\.shop/);
  assert.match(link, /app\.berberflow\.shop/);
});

test('APP_URL estático exposto na classe', () => {
  assert.match(BarbeariaSharePanel.APP_URL, /app\.berberflow\.shop/);
});
