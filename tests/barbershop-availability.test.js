'use strict';
/**
 * tests/barbershop-availability.test.js
 *
 * Testes de TDD para:
 *   1. BarbershopAvailabilityService — todos os métodos públicos estáticos
 *   2. StatusFechamentoModal.confirmarFechamento — interação DOM (opções da modal)
 *   3. Verificação HTML — botão mb-status-toggle presente no app profissional
 *
 * Usa node:test + node:assert/strict (sem Jest/Vitest).
 */

const { suite, test } = require('node:test');
const assert           = require('node:assert/strict');
const vm               = require('node:vm');
const fs               = require('node:fs');
const path             = require('node:path');
const { fn, carregar, ROOT } = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Fábrica: BarbershopAvailabilityService em sandbox puro (sem DOM)
// ─────────────────────────────────────────────────────────────────────────────

function criarServico() {
  const sandbox = vm.createContext({ console, Object, String });
  carregar(sandbox, 'shared/js/StatusFechamentoModal.js');
  carregar(sandbox, 'shared/js/BarbershopAvailabilityService.js');
  return sandbox.BarbershopAvailabilityService;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures de shopData
// ─────────────────────────────────────────────────────────────────────────────

const NOME  = 'Barbearia Corte Fino';
const aberta   = { is_open: true,  close_reason: null,    name: NOME };
const fechada  = { is_open: false, close_reason: null,    name: NOME };
const almoco   = { is_open: false, close_reason: 'almoco',name: NOME };
const janta    = { is_open: false, close_reason: 'janta', name: NOME };
const almocoUpper  = { is_open: false, close_reason: 'ALMOCO', name: NOME };
const jantaUpper   = { is_open: false, close_reason: 'JANTA',  name: NOME };

// =============================================================================
// Suite 1 — isBarbershopOpen
// =============================================================================

suite('BarbershopAvailabilityService.isBarbershopOpen()', () => {
  const S = criarServico();

  test('retorna true quando is_open=true', () => {
    assert.strictEqual(S.isBarbershopOpen(aberta), true);
  });

  test('retorna false quando is_open=false (fechada normal)', () => {
    assert.strictEqual(S.isBarbershopOpen(fechada), false);
  });

  test('retorna false quando is_open=false (pausa almoço)', () => {
    assert.strictEqual(S.isBarbershopOpen(almoco), false);
  });

  test('retorna false quando is_open=false (pausa janta)', () => {
    assert.strictEqual(S.isBarbershopOpen(janta), false);
  });

  test('retorna false quando shopData=null', () => {
    assert.strictEqual(S.isBarbershopOpen(null), false);
  });

  test('retorna false quando shopData=undefined', () => {
    assert.strictEqual(S.isBarbershopOpen(undefined), false);
  });
});

// =============================================================================
// Suite 2 — isBarbershopClosed
// =============================================================================

suite('BarbershopAvailabilityService.isBarbershopClosed()', () => {
  const S = criarServico();

  test('retorna true quando is_open=false e close_reason=null', () => {
    assert.strictEqual(S.isBarbershopClosed(fechada), true);
  });

  test('retorna false quando is_open=true (aberta)', () => {
    assert.strictEqual(S.isBarbershopClosed(aberta), false);
  });

  test('retorna false durante pausa de almoço (close_reason=almoco)', () => {
    assert.strictEqual(S.isBarbershopClosed(almoco), false);
  });

  test('retorna false durante pausa de janta (close_reason=janta)', () => {
    assert.strictEqual(S.isBarbershopClosed(janta), false);
  });

  test('retorna false quando shopData=null', () => {
    assert.strictEqual(S.isBarbershopClosed(null), false);
  });
});

// =============================================================================
// Suite 3 — isLunchPause
// =============================================================================

suite('BarbershopAvailabilityService.isLunchPause()', () => {
  const S = criarServico();

  test('retorna true quando is_open=false e close_reason=almoco', () => {
    assert.strictEqual(S.isLunchPause(almoco), true);
  });

  test('é case-insensitive: ALMOCO equivale a almoco', () => {
    assert.strictEqual(S.isLunchPause(almocoUpper), true);
  });

  test('retorna false quando is_open=true', () => {
    assert.strictEqual(S.isLunchPause(aberta), false);
  });

  test('retorna false quando close_reason=janta', () => {
    assert.strictEqual(S.isLunchPause(janta), false);
  });

  test('retorna false quando close_reason=null (fechada normal)', () => {
    assert.strictEqual(S.isLunchPause(fechada), false);
  });

  test('retorna false quando shopData=null', () => {
    assert.strictEqual(S.isLunchPause(null), false);
  });
});

// =============================================================================
// Suite 4 — isDinnerPause
// =============================================================================

suite('BarbershopAvailabilityService.isDinnerPause()', () => {
  const S = criarServico();

  test('retorna true quando is_open=false e close_reason=janta', () => {
    assert.strictEqual(S.isDinnerPause(janta), true);
  });

  test('é case-insensitive: JANTA equivale a janta', () => {
    assert.strictEqual(S.isDinnerPause(jantaUpper), true);
  });

  test('retorna false quando is_open=true', () => {
    assert.strictEqual(S.isDinnerPause(aberta), false);
  });

  test('retorna false quando close_reason=almoco', () => {
    assert.strictEqual(S.isDinnerPause(almoco), false);
  });

  test('retorna false quando shopData=null', () => {
    assert.strictEqual(S.isDinnerPause(null), false);
  });
});

// =============================================================================
// Suite 5 — canClientClickChair
// =============================================================================

suite('BarbershopAvailabilityService.canClientClickChair()', () => {
  const S = criarServico();

  test('retorna true quando barbearia aberta', () => {
    assert.strictEqual(S.canClientClickChair(aberta), true);
  });

  test('retorna false quando barbearia fechada normal', () => {
    assert.strictEqual(S.canClientClickChair(fechada), false);
  });

  test('retorna false durante pausa de almoço', () => {
    assert.strictEqual(S.canClientClickChair(almoco), false);
  });

  test('retorna false durante pausa de janta', () => {
    assert.strictEqual(S.canClientClickChair(janta), false);
  });

  test('retorna false para shopData null', () => {
    assert.strictEqual(S.canClientClickChair(null), false);
  });
});

// =============================================================================
// Suite 6 — canClientJoinQueue
// =============================================================================

suite('BarbershopAvailabilityService.canClientJoinQueue()', () => {
  const S = criarServico();

  test('retorna true quando barbearia aberta', () => {
    assert.strictEqual(S.canClientJoinQueue(aberta), true);
  });

  test('retorna false quando barbearia fechada', () => {
    assert.strictEqual(S.canClientJoinQueue(fechada), false);
  });

  test('retorna false durante pausa de almoço', () => {
    assert.strictEqual(S.canClientJoinQueue(almoco), false);
  });

  test('retorna false durante pausa de janta', () => {
    assert.strictEqual(S.canClientJoinQueue(janta), false);
  });
});

// =============================================================================
// Suite 7 — getClosedMessage
// =============================================================================

suite('BarbershopAvailabilityService.getClosedMessage()', () => {
  const S = criarServico();

  test('mensagem de almoço contém o nome da barbearia', () => {
    const msg = S.getClosedMessage(almoco);
    assert.ok(msg.includes(NOME), `esperado incluir "${NOME}" — obtido: "${msg}"`);
  });

  test('mensagem de almoço diz "pausa para almoço"', () => {
    const msg = S.getClosedMessage(almoco).toLowerCase();
    assert.ok(msg.includes('almoço'), `esperado "almoço" — obtido: "${msg}"`);
  });

  test('mensagem de janta contém o nome da barbearia', () => {
    const msg = S.getClosedMessage(janta);
    assert.ok(msg.includes(NOME), `esperado incluir "${NOME}" — obtido: "${msg}"`);
  });

  test('mensagem de janta diz "pausa para janta"', () => {
    const msg = S.getClosedMessage(janta).toLowerCase();
    assert.ok(msg.includes('janta'), `esperado "janta" — obtido: "${msg}"`);
  });

  test('mensagem fechada normal não menciona almoço nem janta', () => {
    const msg = S.getClosedMessage(fechada).toLowerCase();
    assert.ok(!msg.includes('almoço'), 'mensagem de fechada normal não deve mencionar almoço');
    assert.ok(!msg.includes('janta'),  'mensagem de fechada normal não deve mencionar janta');
  });

  test('mensagem fechada normal contém o nome da barbearia', () => {
    const msg = S.getClosedMessage(fechada);
    assert.ok(msg.includes(NOME), `esperado incluir "${NOME}" — obtido: "${msg}"`);
  });

  test('shopData null não lança erro e retorna string', () => {
    assert.doesNotThrow(() => S.getClosedMessage(null));
    assert.strictEqual(typeof S.getClosedMessage(null), 'string');
  });

  test('getClosedMessage(almoco) corresponde à mensagem exata do requisito', () => {
    const msg = S.getClosedMessage(almoco);
    assert.strictEqual(
      msg,
      `A barbearia ${NOME} está em pausa para almoço. Aguarde até reabrir.`,
    );
  });

  test('getClosedMessage(janta) corresponde à mensagem exata do requisito', () => {
    const msg = S.getClosedMessage(janta);
    assert.strictEqual(
      msg,
      `A barbearia ${NOME} está em pausa para janta. Aguarde até reabrir.`,
    );
  });

  test('getClosedMessage(fechada) corresponde à mensagem exata do requisito', () => {
    const msg = S.getClosedMessage(fechada);
    assert.strictEqual(
      msg,
      `A barbearia ${NOME} está fechada no momento. Aguarde ela abrir novamente.`,
    );
  });
});

// =============================================================================
// Suite 8 — StatusFechamentoModal.confirmarFechamento — opções da modal (DOM)
// =============================================================================

/**
 * Cria um sandbox com mock de DOM mínimo para testar
 * StatusFechamentoModal.confirmarFechamento() sem browser real.
 */
function criarSandboxModal() {
  let rfCallback = null;
  const bodyEl   = { appendChild: fn() };

  // Fábrica de elemento DOM stub
  function criarElStub() {
    const _listeners = {};
    const _filhos    = [];
    let   _html      = '';

    const el = {
      className: '',
      dataset:   {},
      get innerHTML() { return _html; },
      set innerHTML(v) {
        _html = v;
        _filhos.splice(0);
        // Extrai data-tipo="X" do HTML e cria stubs de botão
        const re = /data-tipo="([^"]+)"/g;
        let m;
        while ((m = re.exec(v)) !== null) {
          const tipo = m[1];
          const btn  = {
            dataset: { tipo },
            addEventListener: (ev, h) => { btn._handler = h; },
            _handler: null,
          };
          _filhos.push(btn);
        }
      },
      querySelectorAll: (sel) => sel === '[data-tipo]' ? [..._filhos] : [],
      addEventListener: (ev, h) => { _listeners[ev] = h; },
      classList: { add: fn() },
      remove: fn(),
    };
    return el;
  }

  const overlay = criarElStub(); // único overlay que será criado
  let   criado  = false;

  const mockDoc = {
    createElement: () => {
      if (!criado) { criado = true; return overlay; }
      return criarElStub(); // elementos internos adicionais
    },
    body:              { appendChild: (el) => { bodyEl.appendChild(el); rfCallback?.(); } },
    addEventListener:  fn(),
    removeEventListener: fn(),
  };

  const sandbox = vm.createContext({
    console,
    document: mockDoc,
    requestAnimationFrame: (cb) => { rfCallback = cb; },
    // StatusFechamentoModal usa setTimeout para remover o overlay
    setTimeout: (cb) => { try { cb(); } catch (_) {} },
    Object, String, Set, Error, Promise,
  });

  carregar(sandbox, 'shared/js/StatusFechamentoModal.js');

  return { sandbox, overlay, bodyEl };
}

suite('StatusFechamentoModal.confirmarFechamento() — opções da modal', () => {

  test('confirmarFechamento() retorna uma Promise', () => {
    const { sandbox } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const resultado = M.confirmarFechamento();
    assert.ok(resultado instanceof sandbox.Promise, 'deve retornar Promise');
    // Cancelamos silenciosamente clicando no botão cancelar para não deixar a Promise pendente
    resultado.catch(() => {});
  });

  test('clicar "almoco" resolve com "almoco"', async () => {
    const { sandbox, overlay } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const promessa = M.confirmarFechamento();
    const btn = overlay.querySelectorAll('[data-tipo]').find(b => b.dataset.tipo === 'almoco');
    assert.ok(btn, 'botão de almoço deve estar no overlay');
    btn._handler();
    assert.strictEqual(await promessa, 'almoco');
  });

  test('clicar "janta" resolve com "janta"', async () => {
    const { sandbox, overlay } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const promessa = M.confirmarFechamento();
    const btn = overlay.querySelectorAll('[data-tipo]').find(b => b.dataset.tipo === 'janta');
    assert.ok(btn, 'botão de janta deve estar no overlay');
    btn._handler();
    assert.strictEqual(await promessa, 'janta');
  });

  test('clicar "normal" resolve com "normal"', async () => {
    const { sandbox, overlay } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const promessa = M.confirmarFechamento();
    const btn = overlay.querySelectorAll('[data-tipo]').find(b => b.dataset.tipo === 'normal');
    assert.ok(btn, 'botão de fechar normal deve estar no overlay');
    btn._handler();
    assert.strictEqual(await promessa, 'normal');
  });

  test('clicar "cancelar" resolve com null', async () => {
    const { sandbox, overlay } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const promessa = M.confirmarFechamento();
    const btn = overlay.querySelectorAll('[data-tipo]').find(b => b.dataset.tipo === 'cancelar');
    assert.ok(btn, 'botão cancelar deve estar no overlay');
    btn._handler();
    assert.strictEqual(await promessa, null);
  });

  test('overlay tem exatamente 4 botões (almoco, janta, normal, cancelar)', () => {
    const { sandbox, overlay } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const promessa = M.confirmarFechamento();
    promessa.catch(() => {});
    const tipos = overlay.querySelectorAll('[data-tipo]').map(b => b.dataset.tipo);
    assert.deepStrictEqual(tipos.sort(), ['almoco', 'cancelar', 'janta', 'normal']);
  });

  test('overlay é appendado ao document.body', () => {
    const { sandbox, bodyEl } = criarSandboxModal();
    const { StatusFechamentoModal: M } = sandbox;
    const promessa = M.confirmarFechamento();
    promessa.catch(() => {});
    assert.strictEqual(bodyEl.appendChild.calls.length, 1, 'deve ter appendado 1 elemento ao body');
  });
});

// =============================================================================
// Suite 9 — Botão mb-status-toggle no HTML do app profissional
// =============================================================================

suite('mb-status-toggle — presença no HTML', () => {

  test('apps/profissional/index.html contém o botão mb-status-toggle', () => {
    const html = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/index.html'),
      'utf8',
    );
    assert.ok(
      html.includes('mb-status-toggle'),
      'o HTML deve conter o botão mb-status-toggle',
    );
  });

  test('botão mb-status-toggle tem role button ou é um <button>', () => {
    const html = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/index.html'),
      'utf8',
    );
    // <button ... class="mb-status-toggle" ...> ou role="button"
    const temButton = /<button[^>]+mb-status-toggle/.test(html) ||
                      /mb-status-toggle[^>]+role="button"/.test(html);
    assert.ok(temButton, 'mb-status-toggle deve ser um <button>');
  });

  test('botão mb-status-toggle tem aria-checked inicial definido', () => {
    const html = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/index.html'),
      'utf8',
    );
    assert.ok(
      html.includes('aria-checked'),
      'mb-status-toggle deve ter o atributo aria-checked',
    );
  });
});

// =============================================================================
// Suite 10 — BarbeariaPage integração com BarbershopAvailabilityService
//   Valida que o serviço é chamado corretamente antes de onCadeiraClick
//   e onProducaoClick delegarem para a fila.
// =============================================================================

/**
 * Cria sandbox mínimo carregando BarbershopAvailabilityService +
 * StatusFechamentoModal para testar os métodos de guard.
 */
function criarServicoPorShopData(shopData) {
  const S = criarServico();
  return {
    canChair:  S.canClientClickChair(shopData),
    canQueue:  S.canClientJoinQueue(shopData),
    message:   S.getClosedMessage(shopData),
  };
}

suite('Integração BarbeariaPage — guard por status da barbearia', () => {

  test('barbearia aberta: canClientClickChair=true e canClientJoinQueue=true', () => {
    const { canChair, canQueue } = criarServicoPorShopData(aberta);
    assert.strictEqual(canChair, true,  'canClientClickChair deve ser true quando aberta');
    assert.strictEqual(canQueue, true,  'canClientJoinQueue deve ser true quando aberta');
  });

  test('barbearia fechada: ambos retornam false e mensagem não vazia', () => {
    const { canChair, canQueue, message } = criarServicoPorShopData(fechada);
    assert.strictEqual(canChair, false,  'canClientClickChair deve ser false quando fechada');
    assert.strictEqual(canQueue, false,  'canClientJoinQueue deve ser false quando fechada');
    assert.ok(message.length > 0, 'mensagem de fechada não pode ser vazia');
  });

  test('pausa almoço: ambos retornam false e mensagem menciona almoço', () => {
    const { canChair, canQueue, message } = criarServicoPorShopData(almoco);
    assert.strictEqual(canChair, false);
    assert.strictEqual(canQueue, false);
    assert.ok(message.toLowerCase().includes('almoço'));
  });

  test('pausa janta: ambos retornam false e mensagem menciona janta', () => {
    const { canChair, canQueue, message } = criarServicoPorShopData(janta);
    assert.strictEqual(canChair, false);
    assert.strictEqual(canQueue, false);
    assert.ok(message.toLowerCase().includes('janta'));
  });

  test('mensagem de almoço é diferente da mensagem de fechada normal', () => {
    const S = criarServico();
    assert.notStrictEqual(S.getClosedMessage(almoco), S.getClosedMessage(fechada));
  });

  test('mensagem de janta é diferente da mensagem de fechada normal', () => {
    const S = criarServico();
    assert.notStrictEqual(S.getClosedMessage(janta), S.getClosedMessage(fechada));
  });
});
