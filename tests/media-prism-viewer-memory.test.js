'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioPrismViewer.js'), 'utf8');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, active) { active ? this.add(value) : this.remove(value); }
}

class FakeElement {
  constructor(tagName = 'div', className = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.classList = new FakeClassList();
    this.attributes = {};
    this.hidden = false;
    this.textContent = '';
    this.src = '';
    this.poster = '';
    this.alt = '';
    this.complete = true;
    this.clientWidth = 320;
    this.paused = true;
  }

  set innerHTML(value) {
    this.children = [];
    if (!String(value).includes('pp-prism-stage')) return;
    this.appendChild(new FakeElement('button', 'pp-prism-close'));
    const meta = this.appendChild(new FakeElement('div', 'pp-prism-meta'));
    meta.appendChild(new FakeElement('img', 'pp-prism-avatar'));
    meta.appendChild(new FakeElement('strong', 'pp-prism-name'));
    meta.appendChild(new FakeElement('span', 'pp-prism-likes'));
    const stage = this.appendChild(new FakeElement('div', 'pp-prism-stage'));
    const cube = stage.appendChild(new FakeElement('div', 'pp-prism-cube'));
    for (let i = 0; i < 6; i += 1) {
      const face = cube.appendChild(new FakeElement('figure', 'pp-prism-face'));
      face.dataset.face = String(i);
      face.appendChild(new FakeElement('div', 'pp-prism-media'));
      // Identidade por face (avatar + nome + like) e barra de progresso
      face.appendChild(new FakeElement('img', 'pp-prism-face-id-img'));
      face.appendChild(new FakeElement('span', 'pp-prism-face-id-name'));
      const faceLike = face.appendChild(new FakeElement('button', 'pp-prism-face-like-btn'));
      faceLike.appendChild(new FakeElement('span', 'pp-prism-face-like-count'));
      face.appendChild(new FakeElement('div', 'pp-prism-progress'));
    }
    stage.appendChild(new FakeElement('div', 'pp-prism-reactions'));
    const publicActions = this.appendChild(new FakeElement('div', 'pp-prism-public-actions'));
    publicActions.appendChild(new FakeElement('img', 'pp-prism-public-logo'));
    const messageWrap = publicActions.appendChild(new FakeElement('div', 'pp-prism-message-wrap'));
    messageWrap.appendChild(new FakeElement('input', 'pp-prism-message-input'));
    messageWrap.appendChild(new FakeElement('button', 'pp-prism-message-send'));
    publicActions.appendChild(new FakeElement('button', 'pp-prism-public-like'));
    publicActions.appendChild(new FakeElement('button', 'pp-prism-public-emoji'));
    // Ações do dono do story (ver mensagens + curtir)
    const ownerActions = this.appendChild(new FakeElement('div', 'pp-prism-story-owner-actions'));
    ownerActions.appendChild(new FakeElement('button', 'portfolio-action pp-prism-story-messages'));
    const ownerLike = ownerActions.appendChild(new FakeElement('button', 'portfolio-action pp-prism-story-owner-like'));
    ownerLike.appendChild(new FakeElement('span', 'portfolio-action__icon'));
    ownerLike.appendChild(new FakeElement('span', 'portfolio-action__count'));
    this.appendChild(new FakeElement('figcaption', 'pp-prism-title'));
    this.appendChild(new FakeElement('div', 'pp-prism-actions'));
    this.appendChild(new FakeElement('span', 'pp-prism-count'));
  }

  get firstElementChild() { return this.children[0] ?? null; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; nodes.forEach(node => this.appendChild(node)); }
  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter(child => child !== this);
    this.parentElement = null;
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
  addEventListener() {}
  removeEventListener() {}
  pause() { this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest?.(selector) ?? null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      if (node.matches(selector)) found.push(node);
      node.children.forEach(walk);
    };
    this.children.forEach(walk);
    return found;
  }
  matches(selector) {
    if (selector.startsWith('.')) return String(this.className).split(/\s+/).includes(selector.slice(1));
    if (selector === 'video') return this.tagName === 'VIDEO';
    if (selector === 'img') return this.tagName === 'IMG';
    return false;
  }
}

test('MediaPrismViewer abre e fecha story 50 vezes sem acumular videos, DOM ou listeners', async () => {
  const body = new FakeElement('body');
  let keydownAdds = 0;
  let keydownRemoves = 0;
  const document = {
    body,
    createElement: tag => new FakeElement(tag),
    addEventListener(type) { if (type === 'keydown') keydownAdds += 1; },
    removeEventListener(type) { if (type === 'keydown') keydownRemoves += 1; },
  };
  const requestAnimationFrame = (cb) => { cb(); return 1; };
  const cancelAnimationFrame = () => {};
  const performance = { now: () => Date.now() };
  const ResizeObserver = class { observe() {} disconnect() {} };

  const factory = new Function(
    'document',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'performance',
    'ResizeObserver',
    `${SRC}\nreturn { MediaPrismViewer };`,
  );
  const { MediaPrismViewer } = factory(
    document,
    requestAnimationFrame,
    cancelAnimationFrame,
    performance,
    ResizeObserver,
  );

  const heapBefore = process.memoryUsage().heapUsed;
  const viewer = MediaPrismViewer.get();
  for (let i = 0; i < 50; i += 1) {
    viewer.open({
      mode: 'story',
      items: [{ id: `s-${i}`, media_url: `https://cdn.example.com/${i}.mp4`, media_type: 'video' }],
      startIndex: 0,
    });
    viewer.close();
  }
  await Promise.resolve();
  const heapAfter = process.memoryUsage().heapUsed;

  assert.strictEqual(body.children.length, 1, 'overlay persistente unico');
  assert.strictEqual(body.querySelectorAll('video').length, 0, 'videos removidos no close');
  assert.strictEqual(keydownAdds, keydownRemoves, 'listeners de teclado balanceados');
  assert.ok(heapAfter - heapBefore < 8 * 1024 * 1024, 'heap sem crescimento relevante');
});
