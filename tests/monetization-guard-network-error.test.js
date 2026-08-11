'use strict';

// =============================================================================
// tests/monetization-guard-network-error.test.js
//
// Bug real: bloqueio intermitente do painel no PWA. Causa raiz: um erro
// transitório de rede/token ao consultar a assinatura (comum ao reabrir o
// app instalado após ficar suspenso em segundo plano tempo suficiente pro
// token expirar) era tratado igual a "plano vencido de verdade" — mesmo
// reason, mesmo cache de 60s. Correção:
//   1. error truthy → reason distinto ('network_or_auth_error'), não
//      confundido com um veredito real de plano.
//   2. resultado de erro NUNCA é cacheado — só respostas de verdade do
//      backend (mesmo quando accessAllowed=false) entram no cache de 60s.
// =============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const fs     = require('node:fs');
const path   = require('node:path');
const { fn, carregar, ROOT } = require('./_helpers.js');

function criarSandbox({ respostas } = {}) {
  const fila = Array.isArray(respostas) ? [...respostas] : [];
  const statusAssinatura = fn().mockImplementation(async () => {
    return fila.length > 1 ? fila.shift() : fila[0];
  });

  const sandbox = vm.createContext({
    console,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    BffApiService: {
      pagamentosProfissional: { statusAssinatura },
    },
  });
  carregar(sandbox, 'apps/profissional/assets/js/MonetizationGuard.js');
  return { sandbox, statusAssinatura };
}

describe('MonetizationGuard.assinaturaPermiteAcesso() — erro de rede/token', () => {

  test('error truthy → reason "network_or_auth_error" (não confundido com plano vencido)', async () => {
    const { sandbox } = criarSandbox({
      respostas: [{ data: null, error: new Error('timeout') }],
    });

    const status = await sandbox.MonetizationGuard.assinaturaPermiteAcesso();

    assert.equal(status.accessAllowed, false);
    assert.equal(status.reason, 'network_or_auth_error');
    assert.notEqual(status.reason, 'expired_subscription');
  });

  test('resultado de erro NÃO é cacheado — próxima chamada refaz a consulta', async () => {
    const { sandbox, statusAssinatura } = criarSandbox({
      respostas: [{ data: null, error: new Error('timeout') }],
    });

    await sandbox.MonetizationGuard.assinaturaPermiteAcesso();
    await sandbox.MonetizationGuard.assinaturaPermiteAcesso();

    assert.equal(statusAssinatura.calls.length, 2,
      'erro não deve ser cacheado — cada chamada deve ir ao backend de novo');
  });

  test('resposta de verdade (accessAllowed=false, plano vencido) É cacheada normalmente', async () => {
    const { sandbox, statusAssinatura } = criarSandbox({
      respostas: [{ data: { accessAllowed: false, reason: 'expired_subscription', subscription: null }, error: null }],
    });

    const s1 = await sandbox.MonetizationGuard.assinaturaPermiteAcesso();
    const s2 = await sandbox.MonetizationGuard.assinaturaPermiteAcesso();

    assert.equal(s1.reason, 'expired_subscription');
    assert.equal(s2.reason, 'expired_subscription');
    assert.equal(statusAssinatura.calls.length, 1,
      'resposta real do backend deve ser cacheada — 2ª chamada não deve refazer a consulta');
  });

  test('resposta de sucesso (accessAllowed=true) também é cacheada', async () => {
    const { sandbox, statusAssinatura } = criarSandbox({
      respostas: [{ data: { accessAllowed: true, reason: 'active_subscription', subscription: { status: 'active' } }, error: null }],
    });

    await sandbox.MonetizationGuard.assinaturaPermiteAcesso();
    await sandbox.MonetizationGuard.assinaturaPermiteAcesso();

    assert.equal(statusAssinatura.calls.length, 1);
  });

  test('depois de um erro, uma nova tentativa bem-sucedida passa a ser cacheada', async () => {
    const { sandbox, statusAssinatura } = criarSandbox({
      respostas: [
        { data: null, error: new Error('timeout') },
        { data: { accessAllowed: true, reason: 'active_subscription', subscription: null }, error: null },
      ],
    });

    const s1 = await sandbox.MonetizationGuard.assinaturaPermiteAcesso();
    assert.equal(s1.reason, 'network_or_auth_error');

    const s2 = await sandbox.MonetizationGuard.assinaturaPermiteAcesso();
    assert.equal(s2.accessAllowed, true);

    const s3 = await sandbox.MonetizationGuard.assinaturaPermiteAcesso();
    assert.equal(s3.accessAllowed, true);
    assert.equal(statusAssinatura.calls.length, 2,
      'primeira (erro, não cacheada) + segunda (sucesso, cacheada) — a 3ª chamada não deve ir ao backend');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// app.js — trata network_or_auth_error como estado neutro, não como bloqueio
// ─────────────────────────────────────────────────────────────────────────────

describe('app.js #navegarComAssinatura — network_or_auth_error não vira banner de plano vencido', () => {
  const SRC = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/js/app.js'), 'utf8');

  function blocoErroTransitorio() {
    const iniFn = SRC.indexOf('async #navegarComAssinatura(tela, modo)');
    assert.ok(iniFn > 0, '#navegarComAssinatura deve existir');
    const iniRede = SRC.indexOf('Rede de segurança', iniFn);
    assert.ok(iniRede > iniFn, 'comentário "Rede de segurança" deve existir depois de #navegarComAssinatura');
    return SRC.slice(iniFn, iniRede);
  }

  test('tenta de novo (force:true) quando reason é network_or_auth_error', () => {
    const bloco = blocoErroTransitorio();
    assert.match(
      bloco,
      /status\.reason\s*===\s*'network_or_auth_error'[\s\S]{0,200}assinaturaPermiteAcesso\(\{\s*force:\s*true\s*\}\)/,
      'deve reavaliar o status com force:true antes de desistir',
    );
  });

  test('estado neutro: avisa via toast e NÃO navega pra planos-pro', () => {
    const bloco = blocoErroTransitorio();
    assert.match(bloco, /NotificationService\.mostrarToast/, 'deve avisar o usuário de forma neutra');
    assert.ok(
      !bloco.includes("super.push('planos-pro')"),
      'não deve empurrar pra tela de planos só por erro transitório de rede/token',
    );
  });

  test('o bloco de erro transitório vem ANTES da rede de segurança de trial e do bloqueio real', () => {
    // blocoErroTransitorio() já garante isso pela própria fatia (termina
    // onde "Rede de segurança" começa) — se o bloco não existir antes
    // disso, a asserção acima já teria falhado. Este teste documenta a
    // ordem esperada explicitamente.
    const idxFn   = SRC.indexOf('async #navegarComAssinatura(tela, modo)');
    const idxErro = SRC.indexOf("status.reason === 'network_or_auth_error'", idxFn);
    const idxRede = SRC.indexOf('Rede de segurança', idxFn);
    const idxBloqueio = SRC.indexOf("this.#prepararTela('planos-pro', { reason: status.reason })", idxFn);
    assert.ok(idxFn < idxErro && idxErro < idxRede && idxRede < idxBloqueio,
      'ordem esperada: gate inicial → tratamento de erro transitório → rede de segurança de trial → bloqueio real de plano');
  });
});
