'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { BarbeariaSharePanel } = require('../shared/js/BarbeariaSharePanel');

const SHOP_ID = '30000000-0000-4000-8000-000000000003';

// Stub mínimo de elementos DOM para o panel (sem jsdom).
function criarElemento() {
  return { value: '', textContent: '', hidden: false, listeners: {},
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    focus() {}, select() {} };
}

function criarRoot() {
  const link   = criarElemento();
  const whats  = criarElemento();
  const copy   = criarElemento();
  const status = criarElemento();
  const map = {
    '[data-mb-share-link]': link,
    '[data-mb-share-whats]': whats,
    '[data-mb-share-copy]': copy,
    '[data-mb-share-status]': status,
  };
  const root = { hidden: false, querySelector: (sel) => map[sel] ?? null, _els: map };
  return root;
}

test('atualizar com id válido revela o card e preenche o link público', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root, { bffBaseUrl: 'https://bff.berberflow.shop' }).montar();

  panel.atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  assert.equal(root.hidden, false, 'card visível');
  assert.equal(root._els['[data-mb-share-link]'].value, `https://bff.berberflow.shop/b/${SHOP_ID}`);
});

test('atualizar sem id mantém o card oculto', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root, { bffBaseUrl: 'https://bff.berberflow.shop' }).montar();

  panel.atualizar({ barbershopId: null, nome: 'X' });

  assert.equal(root.hidden, true, 'card oculto sem barbershopId');
});

test('sem base do BFF o card fica oculto mesmo com id', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root, { bffBaseUrl: '' }).montar();

  panel.atualizar({ barbershopId: SHOP_ID, nome: 'X' });

  assert.equal(root.hidden, true);
});

test('normaliza barra final da base do BFF', () => {
  const root = criarRoot();
  const panel = new BarbeariaSharePanel(root, { bffBaseUrl: 'https://bff.berberflow.shop/' }).montar();

  panel.atualizar({ barbershopId: SHOP_ID, nome: 'X' });

  assert.equal(root._els['[data-mb-share-link]'].value, `https://bff.berberflow.shop/b/${SHOP_ID}`);
});
