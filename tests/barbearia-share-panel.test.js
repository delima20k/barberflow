'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { BarbeariaSharePanel } = require('../shared/js/BarbeariaSharePanel');

const SHOP_ID = '30000000-0000-4000-8000-000000000003';
const ORIGINAL_NAVIGATOR = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const ORIGINAL_WINDOW = Object.getOwnPropertyDescriptor(globalThis, 'window');

function criarElemento() {
  return {
    value: '',
    textContent: '',
    hidden: true,
    listeners: {},
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    focus() {},
    select() {},
  };
}

function criarRoot() {
  const map = {
    '[data-mb-share-link]':    criarElemento(),
    '[data-mb-share-whats]':   criarElemento(),
    '[data-mb-share-copy]':    criarElemento(),
    '[data-mb-share-status]':  criarElemento(),
    '[data-mb-share-preview]': null,
  };
  return { hidden: true, querySelector: sel => map[sel] ?? null, _els: map };
}

function definirGlobal(nome, valor) {
  Object.defineProperty(globalThis, nome, {
    configurable: true,
    value: valor,
  });
}

function restaurarGlobal(nome, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, nome, descriptor);
    return;
  }
  delete globalThis[nome];
}

afterEach(() => {
  restaurarGlobal('navigator', ORIGINAL_NAVIGATOR);
  restaurarGlobal('window', ORIGINAL_WINDOW);
});

test('atualizar com id valido revela section e preenche link publico de OG no input', () => {
  const root = criarRoot();
  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  assert.equal(root.hidden, false);
  assert.match(root._els['[data-mb-share-link]'].value, /app\.barberflow\.live\/b\//);
  assert.match(root._els['[data-mb-share-link]'].value, new RegExp(SHOP_ID));
});

test('input de copia usa rota publica do app e nao URL interna ou SPA direta', () => {
  const root = criarRoot();
  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'X' });

  assert.doesNotMatch(root._els['[data-mb-share-link]'].value, /bff\.barberflow/);
  assert.doesNotMatch(root._els['[data-mb-share-link]'].value, /\?barbearia=/);
  assert.match(root._els['[data-mb-share-link]'].value, /\/b\//);
});

test('atualizar sem id mantem section oculta', () => {
  const root = criarRoot();
  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: null, nome: 'X' });

  assert.equal(root.hidden, true);
});

test('APP_URL estatico aponta para o app cliente', () => {
  assert.match(BarbeariaSharePanel.APP_URL, /app\.barberflow\.live/);
});

test('compartilhar por Web Share envia title, text e URL publica com cache-buster', async () => {
  const root = criarRoot();
  const calls = [];
  definirGlobal('navigator', {
    share: async (payload) => { calls.push(payload); },
  });

  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  await root._els['[data-mb-share-whats]'].listeners.click();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'Barbearia Central');
  assert.match(calls[0].text, /Conhe.a Barbearia Central:/);
  assert.match(calls[0].url, new RegExp(`/b/${SHOP_ID}\\?v=`));
});

test('fallback desktop abre WhatsApp com mensagem completa e URL publica de OG', async () => {
  const root = criarRoot();
  const opened = [];
  definirGlobal('navigator', {});
  definirGlobal('window', {
    location: { hostname: 'app.barberflow.live' },
    open: (url, target, features) => { opened.push({ url, target, features }); },
  });

  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  await root._els['[data-mb-share-whats]'].listeners.click();

  assert.equal(opened.length, 1);
  assert.equal(opened[0].target, '_blank');
  assert.match(decodeURIComponent(opened[0].url), /Conhe.a Barbearia Central:/);
  assert.match(decodeURIComponent(opened[0].url), new RegExp(`/b/${SHOP_ID}\\?v=`));
  assert.doesNotMatch(decodeURIComponent(opened[0].url), /\?barbearia=/);
});

test('copiar no desktop grava mensagem completa com URL publica de OG', async () => {
  const root = criarRoot();
  const copied = [];
  definirGlobal('navigator', {
    clipboard: { writeText: async (text) => { copied.push(text); } },
  });

  new BarbeariaSharePanel(root).montar()
    .atualizar({ barbershopId: SHOP_ID, nome: 'Barbearia Central' });

  await root._els['[data-mb-share-copy]'].listeners.click();

  assert.equal(copied.length, 1);
  assert.match(copied[0], /Conhe.a Barbearia Central:/);
  assert.match(copied[0], new RegExp(`/b/${SHOP_ID}\\?v=`));
  assert.doesNotMatch(copied[0], /\?barbearia=/);
});
