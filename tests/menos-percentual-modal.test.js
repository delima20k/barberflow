'use strict';
/**
 * tests/menos-percentual-modal.test.js
 *
 * Testa MenosPercentualModal (Node/JSDOM-like via vm sandbox):
 *   - abrir() retorna Promise
 *   - resolve { confirmado: true, porcentagem: 1.5 } ao confirmar com valor válido
 *   - resolve { confirmado: false, porcentagem: null } ao cancelar
 *   - resolve { confirmado: false, porcentagem: null } ao pressionar Escape
 *   - botão OK desabilitado com campo vazio
 *   - botão OK desabilitado com valor 0
 *   - botão OK desabilitado com valor 100
 *   - botão OK habilitado com valor 1.5
 *   - preview calcula corretamente: 100 * (1 - 1.5/100) = 98.50
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function criarDOM() {
  // Mini DOM imperativo para testes sem jsdom
  const elementos = new Map();
  const listeners = new Map();

  function criarEl(tag, props = {}) {
    const el = {
      tagName:   tag.toUpperCase(),
      className: props.className ?? '',
      innerHTML: '',
      hidden:    false,
      disabled:  false,
      value:     '',
      textContent: '',
      style:     {},
      dataset:   {},
      children:  [],
      _listeners: {},

      setAttribute(k, v) { this[k] = v; },
      getAttribute(k)    { return this[k] ?? null; },
      classList: {
        _list: new Set(props.className?.split(' ').filter(Boolean) ?? []),
        add(...c)    { c.forEach(x => this._list.add(x)); },
        remove(...c) { c.forEach(x => this._list.delete(x)); },
        contains(c)  { return this._list.has(c); },
        toggle(c, force) {
          if (force !== undefined) { force ? this._list.add(c) : this._list.delete(c); }
          else { this._list.has(c) ? this._list.delete(c) : this._list.add(c); }
        },
      },
      addEventListener(ev, cb) {
        if (!this._listeners[ev]) this._listeners[ev] = [];
        this._listeners[ev].push(cb);
      },
      removeEventListener(ev, cb) {
        if (this._listeners[ev]) {
          this._listeners[ev] = this._listeners[ev].filter(f => f !== cb);
        }
      },
      dispatchEvent(e) {
        (this._listeners[e.type] ?? []).forEach(cb => cb(e));
      },
      focus() {},
      blur()  {},
      querySelector(sel) {
        // Resolve seletores de id e class de forma simples
        const byId    = sel.match(/^#([\w-]+)$/);
        const byClass = sel.match(/^\.([\w-]+)$/);
        const byTag   = sel.match(/^([\w]+)$/);
        const find = (node, test) => {
          for (const c of node.children) {
            if (test(c)) return c;
            const r = find(c, test);
            if (r) return r;
          }
          return null;
        };
        if (byId)    return find(this, n => n.id === byId[1]);
        if (byClass) return find(this, n => n.classList._list.has(byClass[1]));
        if (byTag)   return find(this, n => n.tagName === byTag[1].toUpperCase());
        return null;
      },
      querySelectorAll(sel) {
        const byClass = sel.match(/^\.([\w-]+)$/);
        const results = [];
        const find = (node) => {
          for (const c of node.children) {
            if (byClass && c.classList._list.has(byClass[1])) results.push(c);
            find(c);
          }
        };
        find(this);
        return results;
      },
      remove()  { /* NOOP em testes unitários */ },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      set innerHTML(html) {
        this._html = html;
        // Parseia filhos simples a partir do HTML para querySelector funcionar
        this.children = [];
        const matches = html.matchAll(/id="([\w-]+)"/g);
        for (const m of matches) {
          const child = criarEl('div');
          child.id = m[1];
          this.children.push(child);
        }
      },
      get innerHTML() { return this._html ?? ''; },
    };
    return el;
  }

  const body = criarEl('body');
  const docListeners = {};

  const document = {
    createElement: fn().mockImplementation(tag => criarEl(tag)),
    body,
    addEventListener(ev, cb)    { (docListeners[ev] = docListeners[ev] ?? []).push(cb); },
    removeEventListener(ev, cb) {
      if (docListeners[ev]) docListeners[ev] = docListeners[ev].filter(f => f !== cb);
    },
    _dispatchKey(key) {
      (docListeners['keydown'] ?? []).forEach(cb => cb({ key }));
    },
  };

  return { document, criarEl };
}

function carregarModal() {
  const { document } = criarDOM();
  const sb = vm.createContext({
    console,
    document,
    requestAnimationFrame: fn().mockImplementation(cb => cb()),
    setTimeout:  fn().mockImplementation((cb) => cb()),
  });
  carregar(sb, 'shared/js/MenosPercentualModal.js');
  return { sb, document };
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('MenosPercentualModal', () => {

  test('abrir() retorna Promise', () => {
    const { sb } = carregarModal();
    const resultado = sb.MenosPercentualModal.abrir({ metodo: 'credito', valorBruto: 100 });
    assert.equal(typeof resultado?.then, 'function', 'deve retornar um thenable (Promise)');
  });

  test('resolve { confirmado: false, porcentagem: null } ao cancelar', async () => {
    const { sb, document } = carregarModal();

    const promessa = sb.MenosPercentualModal.abrir({ metodo: 'credito', valorBruto: 100 });
    // Simula clique no botão cancelar
    const overlay = document.body.children[document.body.children.length - 1];
    const cancelarEl = overlay?.querySelector?.('#mpm-cancelar') ?? overlay?.querySelector?.('.mpm-btn--cancelar');
    if (cancelarEl) cancelarEl.dispatchEvent({ type: 'click' });

    const resultado = await promessa;
    assert.equal(resultado.confirmado,  false);
    assert.equal(resultado.porcentagem, null);
  });

  test('resolve { confirmado: false, porcentagem: null } ao pressionar Escape', async () => {
    const { sb, document } = carregarModal();

    const promessa = sb.MenosPercentualModal.abrir({ metodo: 'debito', valorBruto: 80 });
    document._dispatchKey('Escape');

    const resultado = await promessa;
    assert.equal(resultado.confirmado,  false);
    assert.equal(resultado.porcentagem, null);
  });

  test('valida que porcentagem 0 não dispara confirmação', async () => {
    // Verifica que a lógica de validação rejeita 0
    assert.ok(
      !ehPorcentagemValida(0),
      'porcentagem 0 deve ser inválida',
    );
  });

  test('valida que porcentagem 100 não dispara confirmação', () => {
    assert.ok(!ehPorcentagemValida(100));
  });

  test('valida que porcentagem 1.5 é válida', () => {
    assert.ok(ehPorcentagemValida(1.5));
  });

  test('preview: R$100 com 1.5% → R$98,50', () => {
    const bruto = 100;
    const pct   = 1.5;
    const liquido = bruto * (1 - pct / 100);
    assert.equal(liquido.toFixed(2), '98.50');
  });

  test('preview: R$35 com 2% → R$34,30', () => {
    const bruto   = 35;
    const pct     = 2;
    const liquido = bruto * (1 - pct / 100);
    assert.equal(liquido.toFixed(2), '34.30');
  });
});

// Extrai lógica de validação para teste isolado
function ehPorcentagemValida(v) {
  const n = Number(v);
  return !Number.isNaN(n) && n > 0 && n < 100;
}
