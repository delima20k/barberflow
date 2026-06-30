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
  const map = {
    '[data-mb-share-link]':    criarElemento(),
    '[data-mb-share-whats]':   criarElemento(),
    '[data-mb-share-copy]':    criarElemento(),
    '[data-mb-share-status]':  criarElemento(),
    '[data-mb-share-preview]': criarElemento(),
  };
  return { hidden: true, querySelector: sel => map[sel] ?? null, _els: map };
}

test('atualizar com id válido revela section e preenche link do app cliente no input', () => {
  const root = criarRoot();
  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  assert.equal(root.hidden, false);
  assert.match(root._els['[data-mb-share-link]'].value, /app\.barberflow\.live/);
  assert.match(root._els['[data-mb-share-link]'].value, new RegExp(SHOP_ID));
});

test('input de cópia NÃO contém domínio do BFF', () => {
  const root = criarRoot();
  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'X' });

  assert.doesNotMatch(root._els['[data-mb-share-link]'].value, /bff\.barberflow/);
});

test('atualizar sem id mantém section oculta', () => {
  const root = criarRoot();
  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: null, nome: 'X' });

  assert.equal(root.hidden, true);
});

test('APP_URL estático aponta para o app cliente', () => {
  assert.match(BarbeariaSharePanel.APP_URL, /app\.barberflow\.live/);
});
