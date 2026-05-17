'use strict';

// =============================================================
// Testes: PWAInstallBanner (shared/js/PWAInstallBanner.js)
// Runtime: node:test + node:assert/strict
// =============================================================

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fn } = require('./_helpers.js');

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

  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  let bodyChildren = [];

  // getElementById com busca recursiva — encontra elementos aninhados (ex: botão dentro do banner)
  const _getElementById = (id) => {
    function buscar(lista) {
      for (const el of lista) {
        if (el.id === id) return el;
        if (el._children?.length) {
          const achado = buscar(el._children);
          if (achado) return achado;
        }
      }
      return null;
    }
    return buscar(bodyChildren);
  };

  global.document = {
    body: {
      appendChild: (el) => { bodyChildren.push(el); },
    },
    createElement: (tag) => {
      const el = {
        tag,
        id: '', className: '', hidden: false,
        _attrs: {}, _classes: new Set(), _children: [], _events: {},
        classList: {
          add:    (...c) => c.forEach(x => el._classes.add(x)),
          remove: (...c) => c.forEach(x => el._classes.delete(x)),
          has:    (c)    => el._classes.has(c),
        },
        setAttribute:    (k, v) => { el._attrs[k] = v; },
        getAttribute:    (k)    => el._attrs[k] ?? null,
        // Armazena listeners para permitir disparo programático em testes
        addEventListener: (evt, cb) => {
          el._events[evt] = el._events[evt] ?? [];
          el._events[evt].push(cb);
        },
        // Disparo de click programático (usado nos testes de instalação)
        click: () => (el._events['click'] ?? []).forEach(cb => cb()),
        appendChild:     (child) => { el._children.push(child); },
        get offsetHeight() { return 0; },
      };
      return el;
    },
    getElementById:   _getElementById,
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
      // Restaura getElementById após testes que o sobrescrevem manualmente
      document.getElementById = _getElementById;
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

  // ── Novos testes: botão instalável e fluxo de userChoice ──

  it('botão instalar está oculto antes do evento beforeinstallprompt', () => {
    PWAInstallBanner.init();
    const btn = document.getElementById('pwa-install-btn');
    assert.ok(btn, 'botão pwa-install-btn deve existir no DOM');
    assert.equal(btn.hidden, true, 'botão deve estar oculto enquanto app não é instalável');
  });

  it('botão instalar fica visível ao receber evento beforeinstallprompt', () => {
    PWAInstallBanner.init();
    const fakeEvent = {
      preventDefault: fn(),
      prompt:         fn().mockResolvedValue(undefined),
      userChoice:     Promise.resolve({ outcome: 'dismissed' }),
    };
    (shim.winListeners['beforeinstallprompt'] ?? []).forEach(cb => cb(fakeEvent));

    const btn = document.getElementById('pwa-install-btn');
    assert.equal(btn?.hidden, false, 'botão deve aparecer quando app é instalável');
  });

  it('prompt() é chamado ao clicar no botão instalar', async () => {
    PWAInstallBanner.init();
    const promptMock = fn().mockResolvedValue(undefined);
    const fakeEvent = {
      preventDefault: fn(),
      prompt:         promptMock,
      userChoice:     Promise.resolve({ outcome: 'dismissed' }),
    };
    (shim.winListeners['beforeinstallprompt'] ?? []).forEach(cb => cb(fakeEvent));

    const btn = document.getElementById('pwa-install-btn');
    btn?.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(promptMock.calls.length, 1, 'prompt() deve ser chamado exatamente uma vez ao clicar');
  });

  it('banner é fechado quando usuário recusa o prompt (outcome dismissed)', async () => {
    PWAInstallBanner.init();
    const fakeEvent = {
      preventDefault: fn(),
      prompt:         fn().mockResolvedValue(undefined),
      userChoice:     Promise.resolve({ outcome: 'dismissed' }),
    };
    (shim.winListeners['beforeinstallprompt'] ?? []).forEach(cb => cb(fakeEvent));

    const btn = document.getElementById('pwa-install-btn');
    btn?.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const banner = document.getElementById('pwa-install-banner');
    const visivel = banner?._classes.has('pwa-banner--visivel');
    assert.equal(visivel, false, 'banner não deve permanecer visível após o usuário recusar');
  });
});
