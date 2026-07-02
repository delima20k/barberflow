'use strict';

/**
 * animation-service.test.js — AnimationService.animar()
 *
 * Foca no ciclo de vida da animação de SAÍDA (WAAPI):
 *  - onfinish/oncancel devem esconder a tela que saiu (fix do "piscar")
 *  - MAS o oncancel tardio NÃO pode esconder a tela se ela voltou a entrar
 *    (regressão: voltar → reabrir a mesma aba rápido → tela invisível
 *    durante toda a animação de entrada)
 *
 * WAAPI real dispara oncancel de forma ASSÍNCRONA após cancel(); os testes
 * simulam esse timing chamando oncancel() manualmente depois da re-entrada.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers');

function criarSandbox() {
  const sandbox = vm.createContext({
    document: { dispatchEvent: fn() },
    CustomEvent: class CustomEvent {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail; }
    },
    getComputedStyle: () => ({ transform: 'none' }),
    DOMMatrix: class DOMMatrix { constructor() { this.m41 = 0; } },
    console,
    setTimeout, clearTimeout,
  });
  carregar(sandbox, 'shared/js/AnimationService.js');
  return sandbox;
}

/** Stub de <main class="tela"> com WAAPI mínima (animate/getAnimations). */
function criarTela() {
  const el = {
    style: {},
    offsetWidth: 400,
    _anims: [],
    classList: { add: fn(), remove: fn(), contains: () => false },
    getAnimations() { return [...this._anims]; },
    animate() {
      const anim = {
        onfinish: null,
        oncancel: null,
        _cancelada: false,
        cancel: () => {
          const i = el._anims.indexOf(anim);
          if (i >= 0) el._anims.splice(i, 1);
          anim._cancelada = true;
          // oncancel NÃO dispara aqui — WAAPI real o dispara async.
        },
      };
      el._anims.push(anim);
      return anim;
    },
  };
  return el;
}

describe('AnimationService — ciclo de vida da animação de saída', () => {

  it('onfinish esconde a tela que saiu (display none + pointerEvents restaurado)', () => {
    const sb = criarSandbox();
    const el = criarTela();

    sb.AnimationService.animar(el, null, 'saindo', 'ativa');
    const saida = el._anims[0];
    assert.equal(el.style.display, 'flex');
    assert.equal(el.style.pointerEvents, 'none');

    saida.onfinish();

    assert.equal(el.style.display, 'none');
    assert.equal(el.style.pointerEvents, '');
  });

  it('oncancel sem nova animação esconde a tela (fix original do "piscar")', () => {
    const sb = criarSandbox();
    const el = criarTela();

    sb.AnimationService.animar(el, null, 'saindo', 'ativa');
    const saida = el._anims[0];

    saida.cancel();
    saida.oncancel();          // browser dispara async após cancel()

    assert.equal(el.style.display, 'none');
    assert.equal(el.style.pointerEvents, '');
  });

  it('oncancel tardio NÃO esconde a tela que voltou a entrar (regressão voltar→reabrir)', () => {
    const sb = criarSandbox();
    const el = criarTela();

    // 1. tela sai (ex.: usuário clicou em voltar)
    sb.AnimationService.animar(el, null, 'saindo', 'ativa');
    const saida = el._anims[0];

    // 2. antes da saída terminar, usuário reabre a MESMA tela
    sb.AnimationService.animar(null, el, 'saindo', 'ativa');
    assert.equal(saida._cancelada, true, 'entrada deve cancelar a saída em curso');
    assert.equal(el.style.display, 'flex');

    // 3. o oncancel da saída dispara DEPOIS (async no browser)
    saida.oncancel();

    // A tela que está entrando não pode ser apagada
    assert.notEqual(el.style.display, 'none');
  });

  it('entrada limpa pointerEvents residual deixado pela saída interrompida', () => {
    const sb = criarSandbox();
    const el = criarTela();
    el.style.pointerEvents = 'none';   // resto de uma saída anterior

    sb.AnimationService.animar(null, el, 'saindo', 'ativa');

    assert.equal(el.style.pointerEvents, '', 'tela entrando deve voltar a ser clicável');
  });
});
