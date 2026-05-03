'use strict';

// =============================================================
// Testes: PWAInstallBanner (shared/js/PWAInstallBanner.js)
// Runtime: node:test + node:assert/strict
// =============================================================

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Minimal DOM/BOM shim ─────────────────────────────────────
function makeBOMShim() {
  const lsStore = new Map();

  global.localStorage = {
    getItem:    (k) => lsStore.get(k) ?? null,
    setItem:    (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
    clear:      () => lsStore.clear(),
  };

  const winListeners = {};
  global.window = {
    addEventListener: (evt, cb) => {
      winListeners[evt] = winListeners[evt] ?? [];
      winListeners[evt].push(cb);
    },
    matchMedia: () => ({ matches: false }),
  };

  Object.defineProperty(global, 'navigator', {
    value: { standalone: undefined, userAgent: 'Mozilla/5.0' },
    writable: true,
    configurable: true,
  });

  let bodyChildren = [];
  global.document = {
    body: {
      appendChild: (el) => { bodyChildren.push(el); },
    },
    createElement: (tag) => {
      const el = {
        tag,
        id: '', className: '', hidden: false,
        _attrs: {}, _classes: new Set(), _children: [],
        classList: {
          add:    (...c) => c.forEach(x => el._classes.add(x)),
          remove: (...c) => c.forEach(x => el._classes.delete(x)),
          has:    (c)    => el._classes.has(c),
        },
        setAttribute:    (k, v) => { el._attrs[k] = v; },
        getAttribute:    (k)    => el._attrs[k] ?? null,
        addEventListener: () => {},
        appendChild:     (child) => { el._children.push(child); },
        get offsetHeight() { return 0; },
      };
      return el;
    },
    getElementById:   (id) => bodyChildren.find(c => c.id === id) ?? null,
    querySelector:    () => null,
    querySelectorAll: () => [],
  };

  return {
    winListeners,
    getBodyChildren: () => bodyChildren,
    resetAll: () => {
      lsStore.clear();
      bodyChildren = [];
      Object.keys(winListeners).forEach(k => delete winListeners[k]);
      global.window.matchMedia = () => ({ matches: false });
      navigator.standalone = undefined;
    },
  };
}

describe('PWAInstallBanner (shared)', () => {
  let shim;

  before(() => {
    shim = makeBOMShim();
    const fs   = require('node:fs');
    const code = fs.readFileSync(
      require('node:path').join(__dirname, '../shared/js/PWAInstallBanner.js'),
      'utf8'
    );
    global.PWAInstallBanner = new Function(code + '\nreturn PWAInstallBanner;')();
  });

  afterEach(() => {
    shim.resetAll();
    PWAInstallBanner.iconSrc = '/shared/img/icon-192-cliente.png';
    PWAInstallBanner.nomeApp = 'BarberFlow';
  });

  it('não injeta banner se app está em standalone (matchMedia)', () => {
    window.matchMedia = () => ({ matches: true });
    PWAInstallBanner.init();
    assert.equal(shim.getBodyChildren().length, 0, 'nenhum elemento deve ser injetado');
  });

  it('não injeta banner se navigator.standalone = true (iOS)', () => {
    navigator.standalone = true;
    PWAInstallBanner.init();
    assert.equal(shim.getBodyChildren().length, 0, 'nenhum elemento deve ser injetado no iOS standalone');
  });

  it('injeta banner no body ao init quando não instalado', () => {
    PWAInstallBanner.init();
    const banner = shim.getBodyChildren().find(el => el.id === 'pwa-install-banner');
    assert.ok(banner, 'deve injetar elemento com id pwa-install-banner');
  });

  it('não duplica banner em chamadas consecutivas ao init', () => {
    PWAInstallBanner.init();
    const bannerExistente = shim.getBodyChildren().find(el => el.id === 'pwa-install-banner');
    document.getElementById = (id) => id === 'pwa-install-banner' ? bannerExistente : null;
    PWAInstallBanner.init();
    const count = shim.getBodyChildren().filter(el => el.id === 'pwa-install-banner').length;
    assert.ok(count <= 1, 'não deve duplicar o banner');
  });

  it('registra listener beforeinstallprompt ao init', () => {
    PWAInstallBanner.init();
    assert.ok(
      Array.isArray(shim.winListeners['beforeinstallprompt']) &&
      shim.winListeners['beforeinstallprompt'].length > 0,
      'deve escutar beforeinstallprompt'
    );
  });

  it('registra listener appinstalled ao init', () => {
    PWAInstallBanner.init();
    assert.ok(
      Array.isArray(shim.winListeners['appinstalled']) &&
      shim.winListeners['appinstalled'].length > 0,
      'deve escutar appinstalled'
    );
  });
});
