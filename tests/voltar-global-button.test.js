'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fn, carregar, ROOT } = require('./_helpers.js');

function criarBotaoVoltar() {
  const listeners = {};
  const span = {};
  const btn = {
    className: 'btn-voltar',
    dataset: { action: 'voltar' },
    addEventListener: fn((tipo, cb) => {
      listeners[tipo] = cb;
    }),
    _click(target = btn) {
      const evt = {
        target,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
      };
      listeners.click(evt);
      return evt;
    },
  };
  span.closest = fn(() => btn);
  return { btn, span };
}

function criarRouterComBotao() {
  const { btn, span } = criarBotaoVoltar();
  const docListeners = {};
  const viewMock = {
    init: fn(),
    removerBootLock: fn(),
    resetarParaHome: fn(),
    sincronizarUI: fn(),
    exibirToastLoginObrigatorio: fn(),
    bindLoginEvent: fn(),
    telaEl: fn(() => ({ style: {}, classList: { add: fn(), remove: fn() }, getAnimations: () => [] })),
  };

  const sandbox = vm.createContext({
    console,
    setTimeout: () => {},
    clearTimeout: () => {},
    window: { addEventListener: fn(), __routerClickBound: false },
    document: {
      querySelectorAll: fn().mockReturnValue([btn]),
      addEventListener: fn((tipo, cb) => { docListeners[tipo] = cb; }),
    },
    AppState: { get: fn().mockReturnValue(true), onAuth: fn(), set: fn() },
  });

  carregar(sandbox, 'shared/js/Router.js');
  vm.runInContext(`
    class TestRouter extends Router {
      get telasComNav() { return new Set(['inicio', 'perfil']); }
    }
    globalThis.TestRouter = TestRouter;
  `, sandbox);

  const router = new sandbox.TestRouter('perfil', { view: viewMock, animation: { animar: fn() } });
  return { router, btn, span, document: sandbox.document };
}

suite('Botao Voltar global', () => {
  test('HTML profissional nao depende de Pro global inline', () => {
    const html = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');
    const brokenGlobal = 'Pro' + '.voltar';
    assert.equal(html.includes('onclick="' + brokenGlobal + '()"'), false);
    assert.equal(html.includes(brokenGlobal), false);
    assert.match(html, /class="btn-voltar" type="button" data-action="voltar"/);
    assert.match(html, /btn-voltar__texto">Voltar<\/span>/);
    assert.match(html, /btn-voltar__icone" aria-hidden="true">&larr;<\/span>/);
  });

  test('CSS garante largura clicavel minima e filhos sem pointer-events', () => {
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
    const minWidth = css.match(/\.btn-voltar\s*\{[\s\S]*?min-width:\s*(\d+)px/);
    assert.ok(minWidth, 'btn-voltar deve declarar min-width');
    assert.ok(Number(minWidth[1]) > 70, 'btn-voltar deve ter largura maior que 70px');
    assert.match(css, /\.btn-voltar__icone,\s*\.btn-voltar__texto\s*\{[\s\S]*?pointer-events:\s*none/);
  });

  test('clique no botao pai ou no span chama voltar uma unica vez sem window.Pro', () => {
    const { router, btn, span } = criarRouterComBotao();
    const voltar = fn();
    router.voltar = voltar;

    let evt = btn._click(btn);
    assert.equal(voltar.calls.length, 1);
    assert.equal(evt.defaultPrevented, true);
    assert.equal(evt.propagationStopped, true);

    evt = btn._click(span);
    assert.equal(voltar.calls.length, 2);
    assert.equal(evt.defaultPrevented, true);
    assert.equal(evt.propagationStopped, true);
  });

  test('bind direto do Voltar e idempotente', () => {
    const { router, btn } = criarRouterComBotao();
    router._bindDataAttributes();
    router._bindDataAttributes();
    assert.equal(btn.addEventListener.calls.length, 1);
  });
});
