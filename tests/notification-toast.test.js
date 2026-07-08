'use strict';

// =============================================================
// notification-toast.test.js
//
// Cobre o fix do vazamento de toasts em NotificationService.js:
//   1. #fecharToast escuta 'transitionend' (não 'animationend') + fallback
//      por setTimeout → toast.remove() SEMPRE roda (não vaza nó no DOM).
//   2. Dedup: reentrega Realtime do mesmo id NÃO empilha um 2º toast.
//   3. Limite máximo de toasts simultâneos (#MAX_TOASTS) é respeitado.
//
// Testes comportamentais rodam a classe real num sandbox VM com um mock
// mínimo de DOM (children/childElementCount/firstElementChild reais,
// addEventListener/dispatchEvent, dataset) e setTimeout controlável.
// =============================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fn, carregar, ROOT } = require('./_helpers.js');

const SRC = fs.readFileSync(path.join(ROOT, 'shared/js/NotificationService.js'), 'utf8');

// ─── Mock mínimo de elemento DOM ─────────────────────────────────────────────
function criarEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    id: '',
    style: {},
    dataset: {},
    innerHTML: '',
    textContent: '',
    offsetWidth: 0,
    _parent: null,
    _isRoot: false,
    _attrs: {},
    _qsCache: {},
    children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) {
        if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
        else if (f) { this._s.add(c); } else { this._s.delete(c); }
      },
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    removeAttribute(k) { delete this._attrs[k]; },
    addEventListener(type, handler, opts) {
      (listeners[type] || (listeners[type] = [])).push({ handler, once: !!(opts && opts.once) });
    },
    removeEventListener(type, handler) {
      if (listeners[type]) listeners[type] = listeners[type].filter((l) => l.handler !== handler);
    },
    dispatchEvent(evt) {
      const arr = (listeners[evt.type] || []).slice();
      arr.forEach((l) => {
        if (l.once) listeners[evt.type] = listeners[evt.type].filter((x) => x !== l);
        l.handler(evt);
      });
      return true;
    },
    appendChild(child) { child._parent = this; this.children.push(child); return child; },
    insertBefore(newNode, ref) {
      newNode._parent = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i >= 0) this.children.splice(i, 0, newNode); else this.children.push(newNode);
      return newNode;
    },
    remove() {
      if (this._parent) {
        const arr = this._parent.children;
        const i = arr.indexOf(this);
        if (i >= 0) arr.splice(i, 1);
        this._parent = null;
      }
    },
    querySelector(sel) {
      if (!this._qsCache[sel]) this._qsCache[sel] = criarEl('div');
      return this._qsCache[sel];
    },
    querySelectorAll() { return []; },
    get childElementCount() { return this.children.length; },
    get firstElementChild() { return this.children[0] || null; },
    get isConnected() {
      let n = this;
      while (n) { if (n._isRoot) return true; n = n._parent; }
      return false;
    },
  };
  return el;
}

function criarLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

// Cria um sandbox isolado com DOM + timers controláveis + Realtime capturável.
function criarSandbox() {
  const container = criarEl('div');
  container.id = 'notif-toast-container';
  container._isRoot = true;

  const body = criarEl('body');
  body._isRoot = true;

  const documentMock = {
    getElementById: (id) => (id === 'notif-toast-container' ? container : null),
    createElement: (tag) => criarEl(tag),
    body,
    addEventListener: fn(),
    removeEventListener: fn(),
    dispatchEvent: fn(),
  };

  // setTimeout controlável: nada roda até runByDelay()/runAll().
  const timers = [];
  let seq = 0;
  const setTimeoutMock = (cb, delay) => { const id = ++seq; timers.push({ id, cb, delay, cancelled: false }); return id; };
  const clearTimeoutMock = (id) => { const t = timers.find((x) => x.id === id); if (t) t.cancelled = true; };
  const runByDelay = (delay) => {
    const alvo = timers.filter((t) => !t.cancelled && t.delay === delay);
    alvo.forEach((t) => { t.cancelled = true; });
    alvo.forEach((t) => t.cb());
  };

  // Realtime: captura o callback de postgres_changes.
  const realtime = { cb: null };
  const channelObj = {
    on: (_evt, _cfg, cb) => { realtime.cb = cb; return channelObj; },
    subscribe: () => channelObj,
  };
  const SupabaseService = {
    channel: fn().mockReturnValue(channelObj),
    removeChannel: fn(),
    getSession: fn().mockResolvedValue(null),
  };

  const sandbox = vm.createContext({
    console,
    document: documentMock,
    window: {},
    localStorage: criarLocalStorage(),
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    SupabaseService,
    LoggerService: { warn: fn(), error: fn() },
    QueuePoller: { tocarSom: fn() },
  });

  carregar(sandbox, 'shared/js/NotificationService.js');
  return { sandbox, container, timers, runByDelay, realtime, SupabaseService };
}

// ─── Comportamento ────────────────────────────────────────────────────────────

describe('NotificationService — remoção de toast (transitionend + fallback)', () => {
  test('toast.remove() roda ao disparar transitionend (fix principal)', () => {
    const { sandbox, container, runByDelay } = criarSandbox();
    const NS = sandbox.NotificationService;

    NS.mostrarToast('Olá', 'corpo', NS.TIPOS.SISTEMA);
    assert.equal(container.childElementCount, 1, 'toast deve entrar no DOM');
    const toast = container.firstElementChild;

    // Dispara o auto-dismiss → #fecharToast marca saída, mas NÃO remove ainda.
    runByDelay(4500);
    assert.equal(toast.classList.contains('notif-toast--saindo'), true, 'deve entrar em saída');
    assert.equal(container.childElementCount, 1, 'ainda no DOM antes do evento de transição');

    // A transição de saída dispara 'transitionend' (não 'animationend').
    toast.dispatchEvent({ type: 'transitionend' });
    assert.equal(container.childElementCount, 0, 'toast deve sair do DOM ao terminar a transição');
  });

  test('fallback por setTimeout remove o toast mesmo sem transitionend', () => {
    const { sandbox, container, runByDelay } = criarSandbox();
    const NS = sandbox.NotificationService;

    NS.mostrarToast('Olá', '', NS.TIPOS.SISTEMA);
    const toast = container.firstElementChild;

    runByDelay(4500);               // auto-dismiss → #fecharToast agenda fallback
    assert.equal(container.childElementCount, 1, 'ainda no DOM (transitionend nunca vem)');

    runByDelay(400);                // fallback garante a remoção
    assert.equal(container.childElementCount, 0, 'fallback deve remover o toast vazado');
  });

  test('fechar 2× o mesmo toast não quebra (guard dataset.saindo)', () => {
    const { sandbox, container, runByDelay } = criarSandbox();
    const NS = sandbox.NotificationService;

    NS.mostrarToast('Olá', '', NS.TIPOS.SISTEMA);
    const toast = container.firstElementChild;

    runByDelay(4500);               // 1ª saída
    toast.dispatchEvent({ type: 'transitionend' });
    assert.equal(container.childElementCount, 0);
    // Fallback ainda pendente roda sobre nó já removido — não deve lançar.
    assert.doesNotThrow(() => runByDelay(400));
  });
});

describe('NotificationService — dedup de toast (reentrega Realtime)', () => {
  test('mesmo id entregue 2× gera apenas 1 toast', () => {
    const { sandbox, container, realtime } = criarSandbox();
    const NS = sandbox.NotificationService;

    NS.iniciarRealtime('user-1');
    assert.equal(typeof realtime.cb, 'function', 'canal Realtime deve registrar callback');

    const payload = {
      new: {
        id: 'notif-abc',
        type: 'queue_update',
        title: 'Nova posição',
        body: 'Você é o próximo',
        created_at: new Date().toISOString(),
      },
    };

    realtime.cb(payload);           // 1ª entrega
    realtime.cb(payload);           // reentrega (mesmo id)

    assert.equal(container.childElementCount, 1, 'reentrega do mesmo id NÃO deve empilhar 2º toast');
  });

  test('ids diferentes geram toasts distintos', () => {
    const { sandbox, container, realtime } = criarSandbox();
    const NS = sandbox.NotificationService;

    NS.iniciarRealtime('user-1');
    realtime.cb({ new: { id: 'a', type: 'system', title: 'A', created_at: new Date().toISOString() } });
    realtime.cb({ new: { id: 'b', type: 'system', title: 'B', created_at: new Date().toISOString() } });

    assert.equal(container.childElementCount, 2, 'ids distintos devem render 2 toasts');
  });
});

describe('NotificationService — limite máximo de toasts', () => {
  test('nunca ultrapassa #MAX_TOASTS (4) mesmo com muitos toasts', () => {
    const { sandbox, container } = criarSandbox();
    const NS = sandbox.NotificationService;

    for (let i = 0; i < 7; i++) NS.mostrarToast('T' + i, '', NS.TIPOS.SISTEMA);

    assert.ok(container.childElementCount <= 4, `esperado <= 4, veio ${container.childElementCount}`);
    assert.equal(container.childElementCount, 4, 'deve estabilizar no teto de 4 toasts');
  });
});

// ─── Código-fonte (defende o contrato contra regressão silenciosa) ────────────

describe('NotificationService — fonte', () => {
  test('#fecharToast NÃO escuta mais animationend', () => {
    assert.ok(!SRC.includes("addEventListener('animationend'"), 'não deve escutar animationend');
    assert.ok(SRC.includes("addEventListener('transitionend'"), 'deve escutar transitionend');
  });

  test('#fecharToast tem fallback por setTimeout', () => {
    assert.match(SRC, /setTimeout\(remover,\s*400\)/, 'deve ter fallback de remoção');
    assert.match(SRC, /dataset\.saindo/, 'deve ter guard de saída idempotente');
  });

  test('mostrarToast aplica teto de #MAX_TOASTS antes de anexar', () => {
    assert.match(SRC, /#MAX_TOASTS\s*=\s*4/, 'deve definir teto = 4');
    assert.match(SRC, /while\s*\(container\.childElementCount\s*>=\s*NotificationService\.#MAX_TOASTS\)/,
      'deve podar os mais antigos antes do append');
  });

  test('#salvarLocal retorna boolean para dedup', () => {
    assert.match(SRC, /return false;.*duplicata/s, '#salvarLocal deve retornar false em duplicata');
    assert.match(SRC, /if \(!NotificationService\.#salvarLocal\(notif\)\) return/, 'dedup deve gatear o toast');
  });
});
