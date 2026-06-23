'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MusicCopyrightOverlay } = require('../shared/js/MusicCopyrightOverlay');

function el(tag) {
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    parentNode: null,
    _children: [],
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    appendChild(child) {
      if (child.parentNode) child.parentNode._children = child.parentNode._children.filter(c => c !== child);
      child.parentNode = this;
      this._children.push(child);
      return child;
    },
    remove() {
      if (this.parentNode) this.parentNode._children = this.parentNode._children.filter(c => c !== this);
      this.parentNode = null;
    },
  };
  return node;
}

const documentRef = { createElement: el };

test('MusicCopyrightOverlay cria DOM uma vez e atualiza apenas textContent', () => {
  const container = el('div');
  const overlay = new MusicCopyrightOverlay({ container, documentRef });

  const first = overlay.render('Credito A');
  const second = overlay.render('Credito B');

  assert.equal(first, second);
  assert.equal(container._children.length, 1);
  assert.equal(first.textContent, 'Credito B');
  assert.equal(first.attributes.role, 'note');
  assert.equal(first.attributes['aria-live'], 'polite');
});

test('MusicCopyrightOverlay reattach move o mesmo no sem duplicar', () => {
  const a = el('div');
  const b = el('div');
  const overlay = new MusicCopyrightOverlay({ container: a, documentRef });

  const node = overlay.render('Credito');
  overlay.reattach(b);

  assert.equal(overlay.element, node);
  assert.equal(a._children.length, 0);
  assert.equal(b._children.length, 1);
});

test('MusicCopyrightOverlay destroy remove DOM', () => {
  const container = el('div');
  const overlay = new MusicCopyrightOverlay({ container, documentRef });

  overlay.render('Credito');
  overlay.destroy();

  assert.equal(container._children.length, 0);
  assert.equal(overlay.element, null);
});
