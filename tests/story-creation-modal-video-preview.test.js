'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar, fn } = require('./_helpers');

function matchSel(el, sel) {
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
    for (const child of node._children) {
      if (sels.some(sel => matchSel(child, sel))) out.push(child);
      walk(child);
    }
  })(root);
  return out;
}

function makeEl(tag) {
  const listeners = {};
  const isVideo = String(tag).toLowerCase() === 'video';
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    src: '',
    type: '',
    accept: '',
    hidden: false,
    disabled: false,
    muted: false,
    paused: true,
    duration: isVideo ? NaN : 30,
    readyState: isVideo ? 0 : undefined,
    _children: [],
    parentNode: null,
    dataset: {},
    style: { setProperty(k, v) { this[k] = v; } },
    attributes: {},
    get firstChild() { return el._children[0] ?? null; },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    appendChild(c) { c.parentNode = el; el._children.push(c); return c; },
    insertBefore(c, ref) {
      c.parentNode = el;
      const idx = el._children.indexOf(ref);
      if (idx < 0) el._children.push(c);
      else el._children.splice(idx, 0, c);
      return c;
    },
    remove() {
      const p = el.parentNode;
      if (p) p._children = p._children.filter(child => child !== el);
      el.parentNode = null;
    },
    addEventListener(ev, handler) { (listeners[ev] ??= []).push(handler); },
    removeEventListener(ev, handler) {
      if (listeners[ev]) listeners[ev] = listeners[ev].filter(fn => fn !== handler);
    },
    _fire(ev) { for (const handler of listeners[ev] ?? []) handler({ target: el }); },
    play() { el.paused = false; return Promise.resolve(); },
    pause() { el.paused = true; },
    load() {},
    click() { el._fire('click'); },
    querySelector(sel) { return query(el, sel)[0] ?? null; },
    querySelectorAll(sel) { return query(el, sel); },
  };
  return el;
}

function criarSandbox() {
  const docListeners = {};
  const document = {
    body: makeEl('body'),
    documentElement: makeEl('html'),
    createElement: tag => makeEl(tag),
    addEventListener: (ev, handler) => { (docListeners[ev] ??= []).push(handler); },
    removeEventListener: (ev, handler) => {
      if (docListeners[ev]) docListeners[ev] = docListeners[ev].filter(fn => fn !== handler);
    },
  };
  const sandbox = vm.createContext({ document, window: {}, console, setTimeout, clearTimeout });
  carregar(sandbox, 'shared/js/StoryEditorService.js');
  carregar(sandbox, 'shared/js/StoryCreationModal.js');
  return { sandbox, document };
}

const overlay = document => document.body.querySelector('.sc-overlay');

test('StoryCreationModal libera finalizar quando video valido carrega metadata', async () => {
  const { sandbox, document } = criarSandbox();
  const onFinalizar = fn();
  const service = new sandbox.StoryEditorService();
  sandbox.URL = { createObjectURL: () => 'blob:video-ok', revokeObjectURL: () => {} };
  service.definirMedia({ file: { type: 'video/mp4', size: 1024 }, tipo: 'video', origem: 'upload' });

  sandbox.StoryCreationModal.abrir({ service, onFinalizar });
  const ov = overlay(document);
  const video = ov.querySelector('video');
  const final = ov.querySelector('.sc-btn--primario');

  assert.equal(final.disabled, true);
  video.duration = 3;
  video.readyState = 1;
  video._fire('loadedmetadata');
  assert.equal(final.disabled, false);

  final._fire('click');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(onFinalizar.calls.length, 1);
});

test('StoryCreationModal nao finaliza video quando metadata expira', async () => {
  const { sandbox, document } = criarSandbox();
  const onFinalizar = fn();
  const service = new sandbox.StoryEditorService();
  sandbox.URL = { createObjectURL: () => 'blob:video-timeout', revokeObjectURL: () => {} };
  sandbox.StoryComposer.VIDEO_METADATA_TIMEOUT_MS = 5;
  service.definirMedia({ file: { type: 'video/mp4', size: 1024 }, tipo: 'video', origem: 'upload' });

  sandbox.StoryCreationModal.abrir({ service, onFinalizar });
  await new Promise(resolve => setTimeout(resolve, 20));
  const ov = overlay(document);
  const final = ov.querySelector('.sc-btn--primario');
  const processing = ov.querySelector('.sc-processing');

  assert.equal(final.disabled, true);
  assert.equal(processing.hidden, false);
  assert.match(processing.textContent, /Tempo esgotado|video/);
  final._fire('click');
  assert.equal(onFinalizar.calls.length, 0);
  assert.ok(overlay(document));
});

test('StoryCreationModal revoga objectURL ao fechar preview de video', () => {
  const { sandbox, document } = criarSandbox();
  const revoked = [];
  const service = new sandbox.StoryEditorService();
  sandbox.URL = {
    createObjectURL: () => 'blob:video-cleanup',
    revokeObjectURL: url => revoked.push(url),
  };
  service.definirMedia({ file: { type: 'video/mp4', size: 1024 }, tipo: 'video', origem: 'upload' });

  sandbox.StoryCreationModal.abrir({ service });
  overlay(document).querySelector('.sc-close')._fire('click');

  assert.deepEqual(revoked, ['blob:video-cleanup']);
  assert.equal(overlay(document), null);
});
