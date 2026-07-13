'use strict';

/**
 * tests/cadeira-bloqueada-feedback.test.js
 *
 * 1) CadeiraBloqueadaFeedback (classe nova, interfaces):
 *    clique na cadeira de barbeiro indisponível → cadeira balança
 *    rapidamente para os lados (WAAPI) + balão acima da cadeira com a
 *    mensagem de indisponibilidade (auto-remove, sem empilhar).
 *
 * 2) Fiação na página pública:
 *    - Cadeira repassa o elemento clicado ao callback (callback(el))
 *    - BarbeariaPage passa a cadeira aos handlers e o guard de dono
 *      Inativo usa o feedback visual (toast só como fallback)
 *
 * 3) Desistir de esperar (long-press na própria cadeira de espera):
 *    - long-press de 700ms já fiado na Cadeira (proteção)
 *    - modal pergunta se quer realmente desistir, botões "Sim" /
 *      "Continuar esperando"; confirmar → status 'cancelled'
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { fn, carregar, ROOT } = require('./_helpers.js');

const SRC_PAGE = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
const SRC_CADEIRA = fs.readFileSync(path.join(ROOT, 'shared/js/Cadeira.js'), 'utf8');
const SRC_CSS = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
const SRC_HTML_CLI = fs.readFileSync(path.join(ROOT, 'apps/cliente/index.html'), 'utf8');
const SRC_SW_CLI = fs.readFileSync(path.join(ROOT, 'apps/cliente/sw.js'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Sandbox VM para a classe CadeiraBloqueadaFeedback
// ─────────────────────────────────────────────────────────────────────────────

function criarElStub(tag = 'div') {
  const el = {
    tag,
    className: '',
    textContent: '',
    style: {},
    removido: false,
    _classes: new Set(),
    classList: {
      add: (...c) => c.forEach(x => el._classes.add(x)),
      remove: (...c) => c.forEach(x => el._classes.delete(x)),
      contains: (c) => el._classes.has(c),
    },
    setAttribute: fn(),
    remove() { el.removido = true; },
  };
  return el;
}

function criarCadeiraStub() {
  const anims = [];
  return {
    anims,
    animate: (keyframes, opts) => {
      const anim = { keyframes, opts, id: '', cancelada: false, cancel() { this.cancelada = true; } };
      anims.push(anim);
      return anim;
    },
    getAnimations: () => [...anims],
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 40, height: 56 }),
  };
}

function criarSandboxFeedback() {
  const criados = [];
  const body = { filhos: [], appendChild(el) { this.filhos.push(el); } };
  const timers = [];
  const sandbox = vm.createContext({
    console, Object, String, Math, Date, Set, Array, Number,
    window: {},
    document: {
      createElement: (tag) => { const el = criarElStub(tag); criados.push(el); return el; },
      body,
    },
    requestAnimationFrame: (cb) => { cb(); return 1; },
    setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length; },
    clearTimeout: fn(),
  });
  carregar(sandbox, 'shared/js/CadeiraBloqueadaFeedback.js');
  return { sandbox, criados, body, timers };
}

// =============================================================================
// Classe — balanço da cadeira
// =============================================================================

describe('CadeiraBloqueadaFeedback — balanço (unit VM)', () => {
  test('mostrar() balança a cadeira para os lados via WAAPI (translateX alternado)', () => {
    const { sandbox } = criarSandboxFeedback();
    const cadeira = criarCadeiraStub();
    const ok = sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira);
    assert.strictEqual(ok, true, 'mostrar deve reportar sucesso');
    assert.strictEqual(cadeira.anims.length, 1, 'uma animação de balanço');
    const frames = cadeira.anims[0].keyframes.map(k => k.transform).join('|');
    assert.match(frames, /translateX\(-\d+px\)/, 'balança para a esquerda');
    assert.match(frames, /translateX\(\d+px\)/, 'balança para a direita');
    assert.ok(cadeira.anims[0].opts.duration <= 600, 'balanço rápido (≤ 600ms)');
  });

  test('animação de balanço anterior é cancelada antes de reiniciar (sem sobreposição)', () => {
    const { sandbox } = criarSandboxFeedback();
    const cadeira = criarCadeiraStub();
    sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira);
    const primeira = cadeira.anims[0];
    sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira);
    assert.strictEqual(primeira.cancelada, true, 'primeira animação cancelada no re-clique');
    assert.strictEqual(cadeira.anims[0].id, cadeira.anims[1].id, 'mesmo id de animação para o cancel por id');
  });

  test('mostrar(null) não lança e reporta falha', () => {
    const { sandbox } = criarSandboxFeedback();
    assert.strictEqual(sandbox.CadeiraBloqueadaFeedback.mostrar(null), false);
  });

  test('cadeira sem WAAPI (el.animate ausente) não lança — balão ainda aparece', () => {
    const { sandbox, body } = criarSandboxFeedback();
    const cadeira = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) };
    assert.doesNotThrow(() => sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira));
    assert.strictEqual(body.filhos.length, 1, 'balão criado mesmo sem animação');
  });
});

// =============================================================================
// Classe — balão acima da cadeira
// =============================================================================

describe('CadeiraBloqueadaFeedback — balão (unit VM)', () => {
  test('balão é criado acima da cadeira com a mensagem de indisponível', () => {
    const { sandbox, body } = criarSandboxFeedback();
    const cadeira = criarCadeiraStub();
    sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira);
    assert.strictEqual(body.filhos.length, 1, 'balão appendado ao body');
    const balao = body.filhos[0];
    assert.match(balao.className, /cdr-balao-indisponivel/, 'classe do balão');
    assert.match(balao.textContent, /indispon/i, 'mensagem padrão informa indisponibilidade');
    assert.strictEqual(balao.style.left, '120px', 'centralizado na cadeira (left + width/2)');
    assert.strictEqual(balao.style.top, '200px', 'ancorado no topo da cadeira (CSS sobe o balão)');
    assert.ok(balao._classes.has('cdr-balao-indisponivel--visivel'), 'fade-in aplicado no frame seguinte');
  });

  test('mensagem customizada é respeitada', () => {
    const { sandbox, body } = criarSandboxFeedback();
    sandbox.CadeiraBloqueadaFeedback.mostrar(criarCadeiraStub(), 'Volte mais tarde');
    assert.strictEqual(body.filhos[0].textContent, 'Volte mais tarde');
  });

  test('balão some sozinho após a duração (fade-out + remoção)', () => {
    const { sandbox, body, timers } = criarSandboxFeedback();
    sandbox.CadeiraBloqueadaFeedback.mostrar(criarCadeiraStub());
    const balao = body.filhos[0];
    const esconder = timers.find(t => t.ms >= 1000);
    assert.ok(esconder, 'timer de auto-esconder agendado');
    esconder.cb();
    assert.ok(!balao._classes.has('cdr-balao-indisponivel--visivel'), 'fade-out inicia');
    const remover = timers.find(t => t !== esconder);
    assert.ok(remover, 'timer de remoção agendado');
    remover.cb();
    assert.strictEqual(balao.removido, true, 'balão removido do DOM');
  });

  test('cliques repetidos não empilham balões (o anterior é removido)', () => {
    const { sandbox, body } = criarSandboxFeedback();
    const cadeira = criarCadeiraStub();
    sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira);
    sandbox.CadeiraBloqueadaFeedback.mostrar(cadeira);
    assert.strictEqual(body.filhos[0].removido, true, 'primeiro balão removido');
    assert.strictEqual(body.filhos[1].removido, false, 'somente o balão atual visível');
  });
});

// =============================================================================
// Fiação — Cadeira repassa o elemento, BarbeariaPage usa o feedback
// =============================================================================

describe('Fiação — clique na cadeira de barbeiro indisponível', () => {
  test('Cadeira repassa o elemento clicado ao callback (callback(el))', () => {
    const idx = SRC_CADEIRA.indexOf('static #executarComFeedback(el, callback)');
    assert.ok(idx > 0, '#executarComFeedback deve existir');
    const bloco = SRC_CADEIRA.slice(idx, idx + 700);
    assert.match(bloco, /callback\(el\)/, 'callback recebe o elemento da cadeira');
    assert.ok(!/callback\(\)/.test(bloco), 'nenhum caminho deve chamar callback() sem o elemento');
  });

  test('BarbeariaPage repassa a cadeira clicada aos handlers', () => {
    assert.match(
      SRC_PAGE,
      /onProducaoVaziaClick:\s*clientePodeInteragir \? \(cadeiraEl\) => this\.#onProducaoClick\(b\.id, cadeiraEl\)/,
      'produção vazia repassa o elemento',
    );
    assert.match(
      SRC_PAGE,
      /onCadeiraVaziaClick:\s*clientePodeInteragir \? \(cadeiraEl\) => this\.#onCadeiraClick\(b\.id, cadeiraEl\)/,
      'fila vazia repassa o elemento',
    );
  });

  test('guard de dono Inativo usa o feedback visual nos dois handlers', () => {
    for (const handler of ['#onCadeiraClick(professionalId', '#onProducaoClick(professionalId']) {
      const idx = SRC_PAGE.indexOf(`async ${handler}`);
      assert.ok(idx > 0, `${handler} deve existir`);
      const bloco = SRC_PAGE.slice(idx, SRC_PAGE.indexOf('abrirSelecaoServicos', idx));
      assert.match(bloco, /this\.#donoInativo\(professionalId\)/, 'guard preservado');
      assert.match(bloco, /#feedbackCadeiraBloqueada\(cadeiraEl\)/, 'guard delega ao feedback visual');
    }
  });

  test('#feedbackCadeiraBloqueada usa CadeiraBloqueadaFeedback com fallback de toast', () => {
    const idx = SRC_PAGE.indexOf('#feedbackCadeiraBloqueada(');
    assert.ok(idx > 0, '#feedbackCadeiraBloqueada deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 900);
    assert.match(bloco, /CadeiraBloqueadaFeedback\.mostrar\(/, 'balanço + balão via classe nova');
    assert.match(bloco, /typeof CadeiraBloqueadaFeedback !== 'undefined'/, 'guard de carga do script');
    assert.match(bloco, /mostrarToast/, 'toast permanece como fallback sem elemento');
  });
});

// =============================================================================
// Desistir de esperar — long-press na própria cadeira de espera
// =============================================================================

describe('Desistir de esperar — long-press na própria cadeira', () => {
  test('Cadeira: long-press de 700ms fiado nas cadeiras ocupadas com onLongPress', () => {
    assert.match(SRC_CADEIRA, /LONG_PRESS_MS = 700/, 'segurar por 700ms');
    assert.match(SRC_CADEIRA, /ocupada && typeof onLongPress === 'function'/, 'somente cadeira ocupada');
  });

  test('BarbeariaPage: onLongPress apenas na PRÓPRIA entrada de espera (ehMinhaFila)', () => {
    assert.match(
      SRC_PAGE,
      /onLongPress:\s*ehMinhaFila && onMinhaFilaLongPress/,
      'long-press restrito à cadeira do próprio cliente',
    );
  });

  test('#onMinhaCadeiraEsperaLongPress só age na própria entrada em espera (waiting)', () => {
    const idx = SRC_PAGE.indexOf('async #onMinhaCadeiraEsperaLongPress(entrada)');
    assert.ok(idx > 0, '#onMinhaCadeiraEsperaLongPress deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 500);
    assert.match(bloco, /entradaClienteId !== perfil\.id/, 'só a própria entrada');
    assert.match(bloco, /status !== 'waiting'/, 'só cadeira de espera');
  });

  test('modal pergunta se quer realmente desistir, com botões "Sim" e "Continuar esperando"', () => {
    const idx = SRC_PAGE.indexOf('async #onMinhaCadeiraEsperaLongPress(entrada)');
    const bloco = SRC_PAGE.slice(idx, idx + 1600);
    assert.match(bloco, /Desistir de esperar\?/, 'título pergunta sobre desistir');
    assert.match(bloco, /deseja realmente desistir de esperar/, 'mensagem de confirmação explícita');
    assert.match(bloco, /label:\s*'Sim'/, 'botão Sim');
    assert.match(bloco, /label:\s*'Continuar esperando'/, 'botão Continuar esperando');
  });

  test('confirmar desiste (status cancelled); recusar mantém a espera', () => {
    const idx = SRC_PAGE.indexOf('async #onMinhaCadeiraEsperaLongPress(entrada)');
    const bloco = SRC_PAGE.slice(idx, idx + 2600);
    assert.match(bloco, /if \(!confirmar\) return;/, 'recusar → continua esperando, nada muda');
    assert.match(bloco, /QueueRepository\.updateStatus\(entrada\.id, 'cancelled'\)/, 'confirmar → sai da fila');
  });
});

// =============================================================================
// Entrega — CSS, script tag e precache
// =============================================================================

describe('Entrega — CSS, script e cache', () => {
  test('.cdr-balao-indisponivel estilizado (flutuante, sem capturar cliques)', () => {
    const idx = SRC_CSS.indexOf('.cdr-balao-indisponivel {');
    assert.ok(idx > 0, 'CSS do balão deve existir');
    const bloco = SRC_CSS.slice(idx, SRC_CSS.indexOf('}', idx) + 1);
    assert.match(bloco, /position:\s*fixed/, 'posicionado pela viewport (não clipa no scroll das rows)');
    assert.match(bloco, /pointer-events:\s*none/, 'não bloqueia cliques');
    assert.match(SRC_CSS, /\.cdr-balao-indisponivel--visivel/, 'estado visível para o fade');
  });

  test('app cliente carrega CadeiraBloqueadaFeedback.js e o SW faz precache', () => {
    assert.match(SRC_HTML_CLI, /CadeiraBloqueadaFeedback\.js/, 'script tag no index do cliente');
    assert.match(SRC_SW_CLI, /CadeiraBloqueadaFeedback\.js/, 'precache no sw do cliente');
  });
});
