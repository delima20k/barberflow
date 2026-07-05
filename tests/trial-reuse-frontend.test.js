'use strict';

// =============================================================
// trial-reuse-frontend.test.js — Defesa secundária (frontend) contra
// reuso de trial. O bloqueio autoritativo é do backend/banco; aqui
// garantimos que a UI não alimenta a brecha:
//   1. logout() limpa MonetizationGuard (flags de plano em sessionStorage).
//   2. o safety-net do app.js só reativa trial para quem NUNCA teve
//      assinatura (reason === 'missing_subscription'), nunca para
//      trial expirado (reason === 'expired_subscription').
// =============================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { fn, carregar, ROOT } = require('./_helpers.js');

// ─── 1. logout() limpa MonetizationGuard ─────────────────────────────────────

describe('AuthService.logout — limpa MonetizationGuard', () => {
  function criarSandbox() {
    const monetizationLimpar = fn();
    const dispatchSpy = fn();
    const sandbox = vm.createContext({
      console,
      Error,
      CustomEvent: class CustomEvent { constructor(nome, init) { this.nome = nome; this.init = init; } },
      window: { location: { pathname: '/apps/profissional/' } },
      document: { dispatchEvent: dispatchSpy },
      BffAuthClient: { logout: fn().mockResolvedValue(undefined) },
      SupabaseService: { signOut: fn().mockResolvedValue(undefined) },
      SessionCache: { limparTudo: fn(), limparExtras: fn() },
      LegalConsentService: { limparCache: fn() },
      LgpdService: { limparCache: fn() },
      BarbershopService: { limparCache: fn() },
      ProfessionalService: { limparCache: fn() },
      MonetizationGuard: { limpar: monetizationLimpar },
    });
    carregar(sandbox, 'shared/js/AuthService.js');
    return { sandbox, monetizationLimpar };
  }

  test('logout() chama MonetizationGuard.limpar()', async () => {
    const { sandbox, monetizationLimpar } = criarSandbox();
    await sandbox.AuthService.logout();
    assert.equal(monetizationLimpar.calls.length, 1,
      'logout deve limpar as flags de plano/trial do MonetizationGuard');
  });

  test('logout() ainda limpa os caches de sessão já existentes', async () => {
    const { sandbox } = criarSandbox();
    await sandbox.AuthService.logout();
    // Não deve ter regredido: SessionCache continua sendo limpo.
    assert.equal(sandbox.SessionCache.limparTudo.calls.length, 1);
  });
});

// ─── 2. Safety-net do app.js só reativa em missing_subscription ──────────────

describe('app.js safety-net — não renova trial expirado', () => {
  const SRC = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/js/app.js'), 'utf8');

  // Fatia o corpo do #navegarComAssinatura (do comentário "Rede de segurança"
  // até o push('planos-pro')) para inspecionar só o bloco do safety-net.
  function blocoSafetyNet() {
    const ini = SRC.indexOf('Rede de segurança');
    assert.ok(ini > 0, 'comentário "Rede de segurança" deve existir no app.js');
    const fim = SRC.indexOf("super.push('planos-pro')", ini);
    return SRC.slice(ini, fim > ini ? fim : ini + 1200);
  }

  test('o gate exige reason === missing_subscription', () => {
    assert.match(
      blocoSafetyNet(),
      /status\.reason\s*===\s*'missing_subscription'/,
      'o safety-net deve disparar apenas quando o usuário nunca teve assinatura',
    );
  });

  test('o gate continua limitado à intenção de trial e uma vez por sessão', () => {
    const bloco = blocoSafetyNet();
    assert.match(bloco, /MonetizationGuard\.planoSelecionado\s*===\s*'trial'/);
    assert.match(bloco, /!this\.#trialAutoTentado/);
  });

  test('não reativa trial com base apenas em !accessAllowed (sem checar reason)', () => {
    // Garante que a condição de reativação não é só "!status.accessAllowed":
    // o reason de missing_subscription precisa estar na MESMA condição.
    const bloco = blocoSafetyNet();
    const temAccessAllowed = /!status\.accessAllowed/.test(bloco);
    const temReason = /status\.reason\s*===\s*'missing_subscription'/.test(bloco);
    assert.ok(temAccessAllowed && temReason,
      'a reativação deve combinar !accessAllowed COM reason missing_subscription');
  });
});
