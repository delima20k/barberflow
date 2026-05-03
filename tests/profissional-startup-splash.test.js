'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

function makeDOMShim() {
  const sessionStore = new Map();
  global.sessionStorage = {
    getItem:    (k) => sessionStore.get(k) ?? null,
    setItem:    (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear:      () => sessionStore.clear(),
  };

  global.BarberPole = class {
    constructor() {}
    destruir() {}
  };

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
        _attrs:    {},
        _classes:  new Set(),
        style:     {},
        classList: {
          add:    function (...c) { c.forEach(x => el._classes.add(x)); },
          remove: function (...c) { c.forEach(x => el._classes.delete(x)); },
          has:    function (c)    { return el._classes.has(c); },
        },
        setAttribute:  (k, v) => { el._attrs[k] = v; },
        getAttribute:  (k)    => el._attrs[k] ?? null,
        remove:        ()     => { _bodyChildren = _bodyChildren.filter(c => c !== el); },
        querySelector: ()     => null,
      };
      return el;
    },
    getElementById: (id) => _bodyChildren.find(c => c.id === id) ?? null,
  };

  global.requestAnimationFrame = (cb) => { cb(); return 1; };

  return { clearBody: () => { _bodyChildren = []; } };
}

describe('ProfissionalStartupSplash', () => {
  let shim;

  before(() => {
    shim = makeDOMShim();
    const fs   = require('node:fs');
    const code = fs.readFileSync(
      require('node:path').join(__dirname, '../apps/profissional/assets/js/ProfissionalStartupSplash.js'),
      'utf8'
    );
    global.ProfissionalStartupSplash = new Function(code + '\nreturn ProfissionalStartupSplash;')();
  });

  afterEach(() => {
    sessionStorage.clear();
    shim.clearBody();
  });

  it('exibe o overlay na primeira chamada', () => {
    ProfissionalStartupSplash.init();
    const appended = document.body.children;
    assert.ok(appended.length > 0, 'deve injetar overlay no body');
    assert.equal(appended[0].id, 'profissional-startup-splash');
  });

  it('nao exibe na segunda chamada na mesma sessao', () => {
    ProfissionalStartupSplash.init();
    shim.clearBody();
    ProfissionalStartupSplash.init();
    assert.equal(document.body.children.length, 0, 'nao deve re-injetar');
  });

  it('exibe novamente apos limparSessao()', () => {
    ProfissionalStartupSplash.init();
    shim.clearBody();
    ProfissionalStartupSplash.limparSessao();
    ProfissionalStartupSplash.init();
    assert.ok(document.body.children.length > 0, 'deve injetar apos limpar');
  });

  it('persiste a chave de sessao no sessionStorage', () => {
    ProfissionalStartupSplash.init();
    assert.equal(sessionStorage.getItem('bf_pro_splash_shown'), '1');
  });

  it('limparSessao remove a chave do sessionStorage', () => {
    ProfissionalStartupSplash.init();
    ProfissionalStartupSplash.limparSessao();
    assert.equal(sessionStorage.getItem('bf_pro_splash_shown'), null);
  });
});
