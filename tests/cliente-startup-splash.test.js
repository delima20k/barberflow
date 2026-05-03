'use strict';

// =============================================================
// Testes: ClienteStartupSplash
// Runtime: node:test + node:assert/strict
// =============================================================

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Minimal DOM shim ─────────────────────────────────────────
function makeDOMShim() {
  const storage = new Map();
  const sessionStore = new Map();

  global.sessionStorage = {
    getItem:    (k) => sessionStore.get(k) ?? null,
    setItem:    (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear:      () => sessionStore.clear(),
  };

  global.localStorage = {
    getItem:    (k) => storage.get(k) ?? null,
    setItem:    (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear:      () => storage.clear(),
  };

  // Stub BarberPole para não explodir sem canvas
  global.BarberPole = class {
    constructor() {}
    destruir() {}
  };

  // Minimal document + body
  let _bodyChildren = [];
  global.document = {
    body: {
      appendChild: (el) => { _bodyChildren.push(el); },
      get children() { return _bodyChildren; },
    },
    createElement: (tag) => {
      const el = {
        tag,
        id: '',
        className: '',
        innerHTML: '',
        _attrs: {},
        _classes: new Set(),
        _children: [],
        _listeners: {},
        style: {},
        classList: {
          add:    function(...c) { c.forEach(x => el._classes.add(x)); },
          remove: function(...c) { c.forEach(x => el._classes.delete(x)); },
          has:    function(c)    { return el._classes.has(c); },
        },
        setAttribute:    (k, v) => { el._attrs[k] = v; },
        getAttribute:    (k)    => el._attrs[k] ?? null,
        remove:          ()     => {
          _bodyChildren = _bodyChildren.filter(c => c !== el);
        },
        querySelector:   ()     => null,
      };
      return el;
    },
    getElementById: (id) => _bodyChildren.find(c => c.id === id) ?? null,
  };

  global.requestAnimationFrame = (cb) => { cb(); return 1; };

  return { clearBody: () => { _bodyChildren = []; } };
}

describe('ClienteStartupSplash', () => {
  let shim;

  before(() => {
    shim = makeDOMShim();
    // Carrega a classe sob teste expondo-a no escopo global
    const fs   = require('node:fs');
    const code = fs.readFileSync(
      require('node:path').join(__dirname, '../apps/cliente/assets/js/ClienteStartupSplash.js'),
      'utf8'
    );
    // new Function cria escopo próprio com acesso ao global — evita problema do eval em strict mode
    global.ClienteStartupSplash = new Function(code + '\nreturn ClienteStartupSplash;')();
  });

  afterEach(() => {
    sessionStorage.clear();
    shim.clearBody();
  });

  it('exibe o overlay na primeira chamada', () => {
    ClienteStartupSplash.init();
    const appended = document.body.children;
    assert.ok(appended.length > 0, 'deve injetar overlay no body');
    assert.equal(appended[0].id, 'cliente-startup-splash');
  });

  it('não exibe na segunda chamada na mesma sessão', () => {
    ClienteStartupSplash.init();
    shim.clearBody();
    ClienteStartupSplash.init();
    assert.equal(document.body.children.length, 0, 'não deve re-injetar');
  });

  it('exibe novamente após limparSessao()', () => {
    ClienteStartupSplash.init();
    shim.clearBody();
    ClienteStartupSplash.limparSessao();
    ClienteStartupSplash.init();
    assert.ok(document.body.children.length > 0, 'deve injetar após limpar');
  });

  it('persiste a chave de sessão no sessionStorage', () => {
    ClienteStartupSplash.init();
    assert.equal(sessionStorage.getItem('bf_splash_shown'), '1');
  });

  it('limparSessao remove a chave do sessionStorage', () => {
    ClienteStartupSplash.init();
    ClienteStartupSplash.limparSessao();
    assert.equal(sessionStorage.getItem('bf_splash_shown'), null);
  });
});
