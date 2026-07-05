'use strict';

// =============================================================
// trial-avisos.test.js — P3 (banner "plano vencido" na tela de planos)
// e P1 (contador de teste grátis compacto + re-render por reentrada).
//
// Nada aqui toca no gate/accessAllowed nem no P2 já deployado — só o
// repasse do reason, o banner e o texto/re-render do contador.
// =============================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const fs     = require('node:fs');
const path   = require('node:path');
const { carregar } = require('./_helpers.js');

const ROOT      = path.resolve(__dirname, '..');
const SRC_APP   = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/js/app.js'), 'utf8');
const SRC_MB    = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'), 'utf8');
const SRC_CSS   = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
const SRC_INDEX = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');

function criarEl() {
  return { textContent: '', hidden: true, className: '', style: {} };
}

// ═══════════════════════════════════════════════════════════════
// P3 — Banner de bloqueio na tela de planos
// ═══════════════════════════════════════════════════════════════

describe('P3 — PlanosController.mensagemBloqueio (reason → texto)', () => {
  const sb = vm.createContext({ console });
  carregar(sb, 'apps/profissional/assets/js/controllers/PlanosController.js');
  const PC = sb.PlanosController;

  test('expired_subscription → mensagem de plano vencido', () => {
    assert.match(PC.mensagemBloqueio('expired_subscription'), /venceu/i);
  });

  test('missing_subscription → sem banner (null)', () => {
    assert.equal(PC.mensagemBloqueio('missing_subscription'), null);
  });

  test('navegação espontânea (reason null/undefined) → sem banner', () => {
    assert.equal(PC.mensagemBloqueio(null), null);
    assert.equal(PC.mensagemBloqueio(undefined), null);
  });

  test('inactive/unavailable → mensagem genérica amigável e acionável', () => {
    assert.match(PC.mensagemBloqueio('inactive_subscription'), /inativo/i);
    assert.match(PC.mensagemBloqueio('subscription_unavailable'), /Não foi possível/i);
    assert.match(PC.mensagemBloqueio('subscription_status_unavailable'), /Não foi possível/i);
  });
});

describe('P3 — banner é exibido/ocultado via prepararTelaPlanos', () => {
  function preparar(reason) {
    const avisoEl = criarEl();
    const sb = vm.createContext({
      console,
      document: {
        getElementById:   (id) => (id === 'ppp-aviso-bloqueio' ? avisoEl : null),
        querySelector:    () => null,
        querySelectorAll: () => [],
      },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      MonetizationGuard: { assinaturaPermiteAcesso: async () => ({ subscription: null }) },
      AuthService: { getPerfil: () => null },
    });
    carregar(sb, 'apps/profissional/assets/js/controllers/PlanosController.js');
    const pc = new sb.PlanosController(() => {});
    pc.prepararTelaPlanos(null, reason);
    return avisoEl;
  }

  test('banner APARECE com expired_subscription', () => {
    const el = preparar('expired_subscription');
    assert.equal(el.hidden, false);
    assert.match(el.textContent, /venceu/i);
  });

  test('banner NÃO aparece com missing_subscription', () => {
    const el = preparar('missing_subscription');
    assert.equal(el.hidden, true);
    assert.equal(el.textContent, '');
  });

  test('banner NÃO aparece em navegação espontânea (sem reason)', () => {
    const el = preparar(undefined);
    assert.equal(el.hidden, true);
  });
});

describe('P3 — app.js repassa reason SÓ no caminho de bloqueio (fonte)', () => {
  test('#prepararTela tem reason com default null', () => {
    assert.match(SRC_APP, /#prepararTela\(tela,\s*\{\s*reason\s*=\s*null\s*\}\s*=\s*\{\}\)/);
  });

  test('o bloqueio (!accessAllowed) passa status.reason para planos-pro', () => {
    assert.match(SRC_APP, /this\.#prepararTela\('planos-pro',\s*\{\s*reason:\s*status\.reason\s*\}\)/);
  });

  test('prepararTelaPlanos é chamado com o reason', () => {
    assert.match(SRC_APP, /prepararTelaPlanos\(.*,\s*reason\)/);
  });

  test('index.html contém o elemento do banner', () => {
    assert.match(SRC_INDEX, /id="ppp-aviso-bloqueio"[^>]*hidden/);
  });
});

// ═══════════════════════════════════════════════════════════════
// P1 — Contador de teste grátis
// ═══════════════════════════════════════════════════════════════

describe('P1 — MinhaBarbeariaRuntimeController.textoTrialAviso (texto compacto)', () => {
  const sb = vm.createContext({ console });
  carregar(sb, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js');
  const RC = sb.MinhaBarbeariaRuntimeController;

  // Objetos vêm do realm do sandbox (protótipo distinto) → comparar campos.
  test('dias >= 2 → "VC tem X dias" (não urgente)', () => {
    const r = RC.textoTrialAviso(7);
    assert.equal(r.texto, 'VC tem 7 dias');
    assert.equal(r.urgente, false);
    assert.equal(RC.textoTrialAviso(2).texto, 'VC tem 2 dias');
  });

  test('voucher/30 dias coberto → "VC tem 30 dias"', () => {
    const r = RC.textoTrialAviso(30);
    assert.equal(r.texto, 'VC tem 30 dias');
    assert.equal(r.urgente, false);
  });

  test('dias === 1 → "VC tem 1 dia" (urgente)', () => {
    const r = RC.textoTrialAviso(1);
    assert.equal(r.texto, 'VC tem 1 dia');
    assert.equal(r.urgente, true);
  });

  test('dias <= 0 → "Plano venceu" (urgente)', () => {
    const r = RC.textoTrialAviso(0);
    assert.equal(r.texto, 'Plano venceu');
    assert.equal(r.urgente, true);
  });

  test('calcularDiasTrial continua correto para 30 dias (voucher)', () => {
    const DIA = 24 * 60 * 60 * 1000;
    const now = Date.parse('2026-07-04T12:00:00.000Z');
    const ends = new Date(now + 30 * DIA).toISOString();
    assert.equal(RC.calcularDiasTrial(ends, now), 30);
  });
});

describe('P1 — re-render por reentrada + CSS compacto (fonte)', () => {
  test('MutationObserver re-renderiza o trial FORA do guard #carregou', () => {
    const idx = SRC_MB.indexOf('if (!this.#carregou)');
    assert.ok(idx > 0, 'guard #carregou deve existir no observer');
    const bloco = SRC_MB.slice(idx, idx + 600);
    // No ramo já-carregado (else) deve chamar #renderTrialAviso a cada 'ativa'
    assert.match(bloco, /\}\s*else\s*\{[\s\S]*#renderTrialAviso\(\)/);
  });

  test('#renderTrialAviso usa o texto compacto via textoTrialAviso', () => {
    assert.match(SRC_MB, /textoTrialAviso\(dias\)/);
    // Textos antigos e longos não devem mais existir
    assert.doesNotMatch(SRC_MB, /dias de teste grátis/);
  });

  test('.mb-trial-aviso ficou compacto (nowrap + largura pelo conteúdo)', () => {
    const idx = SRC_CSS.indexOf('.mb-trial-aviso {');
    assert.ok(idx > 0);
    const bloco = SRC_CSS.slice(idx, idx + 400);
    assert.match(bloco, /white-space:\s*nowrap/);
    assert.match(bloco, /width:\s*max-content/);
  });
});
