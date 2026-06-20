'use strict';

// Testes de componente do StoryCreationModal — vm-sandbox + DOM mock
// (estilo tests/fluxo-de-fila.test.js). Verifica render, sub-modal de
// emoji, criação de overlay de texto, arrasto e callback de finalizar.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('node:vm');
const { carregar, fn } = require('./_helpers');

// ── DOM mock mínimo ──────────────────────────────────────────

function matchSel(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('.')) {
    const classes = sel.slice(1).split('.').filter(Boolean);
    const own = el.className.split(/\s+/).filter(Boolean);
    return classes.every(c => own.includes(c));
  }
  return el.tagName === sel.toUpperCase();
}
function query(root, selector) {
  const sels = selector.split(',').map(s => s.trim()).filter(Boolean);
  const out = [];
  (function walk(node) {
    for (const c of node._children) {
      if (sels.some(s => matchSel(c, s))) out.push(c);
      walk(c);
    }
  })(root);
  return out;
}

function makeEl(tag) {
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '', textContent: '', value: '', src: '',
    type: '', accept: '', placeholder: '',
    muted: false, hidden: false, disabled: false, files: null,
    _children: [], parentNode: null, dataset: {}, style: {}, attributes: {},
    get firstChild() { return el._children[0] ?? null; },
    classList: {
      _set: () => new Set(el.className.split(/\s+/).filter(Boolean)),
      add(c)      { const s = el.classList._set(); s.add(c);    el.className = [...s].join(' '); },
      remove(c)   { const s = el.classList._set(); s.delete(c); el.className = [...s].join(' '); },
      contains(c) { return el.className.split(/\s+/).includes(c); },
      toggle(c, f){ const has = el.classList.contains(c); const add = f === undefined ? !has : f; add ? el.classList.add(c) : el.classList.remove(c); },
    },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    getAttribute(k)    { return el.attributes[k] ?? null; },
    appendChild(c)     { c.parentNode = el; el._children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = el; const i = el._children.indexOf(ref); if (i < 0) el._children.push(c); else el._children.splice(i, 0, c); return c; },
    remove()           { const p = el.parentNode; if (p) p._children = p._children.filter(x => x !== el); el.parentNode = null; },
    addEventListener(ev, h)    { (listeners[ev] ??= []).push(h); },
    removeEventListener(ev, h) { if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== h); },
    _fire(ev, data = {}) { [...(listeners[ev] ?? [])].forEach(h => h({ target: el, preventDefault() {}, stopPropagation() {}, ...data })); },
    setPointerCapture() {}, releasePointerCapture() {},
    focus() { el._fire('focus'); }, blur() { el._fire('blur'); }, click() { el._fire('click'); }, play() {},
    querySelector(s)    { return query(el, s)[0] ?? null; },
    querySelectorAll(s) { return query(el, s); },
  };
  return el;
}

function criarSandbox() {
  const docListeners = {};
  const document = {
    body: makeEl('body'),
    documentElement: makeEl('html'),
    createElement: (t) => makeEl(t),
    addEventListener: (ev, h) => { (docListeners[ev] ??= []).push(h); },
    removeEventListener: (ev, h) => { if (docListeners[ev]) docListeners[ev] = docListeners[ev].filter(f => f !== h); },
    _fire: (ev, data = {}) => [...(docListeners[ev] ?? [])].forEach(h => h(data)),
  };
  const sandbox = vm.createContext({ document, window: {}, console });
  carregar(sandbox, 'shared/js/StoryEditorService.js');
  carregar(sandbox, 'shared/js/StoryCreationModal.js');
  return { sandbox, document };
}

const getOverlay = (document) => document.body.querySelector('.sc-overlay');

// ── Testes ───────────────────────────────────────────────────

test('abrir() monta a estrutura básica da modal', () => {
  const { sandbox, document } = criarSandbox();
  sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });

  const ov = getOverlay(document);
  assert.ok(ov, '.sc-overlay deve ser anexado ao body');
  assert.ok(ov.querySelector('.sc-preview'), 'tem o quadro de preview');
  assert.ok(ov.querySelector('.sc-side-menu'), 'tem o menu lateral');
  assert.ok(ov.querySelector('.sc-text-bar'), 'tem a barra de texto abaixo do preview');
  assert.equal(ov.querySelectorAll('.sc-tool').length, 3, 'menu lateral: upload, câmera, emoji');
  assert.ok(ov.querySelector('.sc-bottom-actions'), 'tem a barra de ações inferior');
  assert.equal(ov.querySelectorAll('.sc-btn').length, 2, 'dois botões inferiores');
  assert.ok(ov.querySelector('.sc-btn--primario'), 'tem o botão Finalizar');
});

test('botão Emoji abre a sub-modal de emojis', () => {
  const { sandbox, document } = criarSandbox();
  sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });
  const ov = getOverlay(document);

  assert.equal(ov.querySelector('.sc-emoji-sheet'), null, 'sheet não existe antes');
  ov.querySelectorAll('.sc-tool')[2]._fire('click'); // 3º = Emoji
  const sheet = ov.querySelector('.sc-emoji-sheet');
  assert.ok(sheet, 'sub-modal de emoji aberta');
  assert.equal(sheet.hidden, false);
  assert.equal(sheet.querySelectorAll('.sc-emoji-btn').length, sandbox.StoryCreationModal.EMOJIS.length);
});

test('enviar texto cria um overlay de texto no preview e no serviço', () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service });
  const ov = getOverlay(document);

  const input = ov.querySelector('.sc-text-input');
  input.value = 'Promoção';
  ov.querySelector('.sc-text-send')._fire('click');

  assert.equal(service.estado.overlays.length, 1);
  assert.equal(service.estado.overlays[0].tipo, 'texto');
  assert.equal(service.estado.overlays[0].conteudo, 'Promoção');
  assert.ok(ov.querySelector('.sc-overlay-item.sc-overlay-texto'), 'overlay renderizado no preview');
  assert.equal(input.value, '', 'input é limpo após enviar');
});

test('escolher emoji cria um overlay de emoji', () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  ov.querySelector('.sc-emoji-btn')._fire('click');

  assert.equal(service.estado.overlays.length, 1);
  assert.equal(service.estado.overlays[0].tipo, 'emoji');
  assert.ok(ov.querySelector('.sc-overlay-item.sc-overlay-emoji'));
});

test('arrastar (1 ponteiro) move o overlay via serviço', () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service });
  const ov = getOverlay(document);

  const input = ov.querySelector('.sc-text-input');
  input.value = 'X';
  ov.querySelector('.sc-text-send')._fire('click');

  const item = ov.querySelector('.sc-overlay-item');
  const id = item.dataset.overlayId;
  const baseX = service.obterOverlay(id).posicao.x;
  const baseY = service.obterOverlay(id).posicao.y;

  item._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  item._fire('pointermove', { pointerId: 1, clientX: 130, clientY: 140 });

  assert.equal(service.obterOverlay(id).posicao.x, baseX + 30);
  assert.equal(service.obterOverlay(id).posicao.y, baseY + 40);
});

test('Finalizar chama o callback onFinalizar com o estado', () => {
  const { sandbox, document } = criarSandbox();
  const onFinalizar = fn();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service, onFinalizar });
  const ov = getOverlay(document);

  ov.querySelector('.sc-btn--primario')._fire('click');

  assert.equal(onFinalizar.calls.length, 1);
  assert.ok(onFinalizar.calls[0][0], 'recebe o snapshot do estado');
  assert.ok('overlays' in onFinalizar.calls[0][0]);
});

test('fechar pelo × remove a modal do body', () => {
  const { sandbox, document } = criarSandbox();
  const modal = sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });
  assert.ok(getOverlay(document));
  getOverlay(document).querySelector('.sc-close')._fire('click');
  assert.equal(getOverlay(document), null, 'modal removida');
});
