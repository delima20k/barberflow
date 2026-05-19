'use strict';
/**
 * tests/barbershop-close-reason.test.js
 *
 * Testes para:
 *   1. BarbershopRepository.updateIsOpen — validações de entrada e payload gerado
 *   2. StatusFechamentoModal helpers estáticos — labelStatus, classeStatus, classBadge
 *
 * Usa node:test + node:assert/strict (sem Jest/Vitest).
 * StatusFechamentoModal é testado em ambiente headless (sem DOM):
 * apenas os helpers puros são verificáveis fora do browser.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const UUID_SHOP = 'a1b2c3d4-e5f6-4a7b-8c9d-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// Fábrica do BarbershopRepository em sandbox
// ─────────────────────────────────────────────────────────────────────────────

function criarRepo({ error = null } = {}) {
  const builder = {
    update:  fn().mockReturnThis(),
    eq:      fn().mockResolvedValue({ data: null, error }),
  };
  // Encadeia métodos para retornar o builder
  builder.update.mockReturnValue(builder);

  const apiMock = { from: fn().mockReturnValue(builder) };

  const sandbox = vm.createContext({ console, ApiService: apiMock, Promise, Error, TypeError, Set });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/BarbershopRepository.js');

  return { repo: sandbox.BarbershopRepository, builder, apiMock };
}

// ─────────────────────────────────────────────────────────────────────────────
// BarbershopRepository.updateIsOpen
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbershopRepository.updateIsOpen()', () => {

  test('chama update com is_open=true e close_reason=null ao abrir', async () => {
    const { repo, builder } = criarRepo();
    await repo.updateIsOpen(UUID_SHOP, true, null);
    const payload = builder.update.calls[0][0];
    assert.strictEqual(payload.is_open, true);
    assert.strictEqual(payload.close_reason, null);
    assert.ok(typeof payload.updated_at === 'string');
  });

  test('chama update com is_open=false e close_reason=almoco', async () => {
    const { repo, builder } = criarRepo();
    await repo.updateIsOpen(UUID_SHOP, false, 'almoco');
    const payload = builder.update.calls[0][0];
    assert.strictEqual(payload.is_open, false);
    assert.strictEqual(payload.close_reason, 'almoco');
  });

  test('chama update com is_open=false e close_reason=janta', async () => {
    const { repo, builder } = criarRepo();
    await repo.updateIsOpen(UUID_SHOP, false, 'janta');
    const payload = builder.update.calls[0][0];
    assert.strictEqual(payload.is_open, false);
    assert.strictEqual(payload.close_reason, 'janta');
  });

  test('fecha sem motivo: close_reason=null quando tipo é normal', async () => {
    const { repo, builder } = criarRepo();
    await repo.updateIsOpen(UUID_SHOP, false, null);
    const payload = builder.update.calls[0][0];
    assert.strictEqual(payload.is_open, false);
    assert.strictEqual(payload.close_reason, null);
  });

  test('reabre: força close_reason=null mesmo que motivo seja passado', async () => {
    const { repo, builder } = criarRepo();
    await repo.updateIsOpen(UUID_SHOP, true, 'almoco');
    const payload = builder.update.calls[0][0];
    assert.strictEqual(payload.is_open, true);
    assert.strictEqual(payload.close_reason, null, 'ao reabrir, close_reason deve ser null');
  });

  test('lança TypeError para barbershopId não-UUID', async () => {
    const { repo } = criarRepo();
    await assert.rejects(
      () => repo.updateIsOpen('nao-e-uuid', false, null),
      /barbershopId/
    );
  });

  test('lança TypeError para barbershopId com SQL injection', async () => {
    const { repo } = criarRepo();
    await assert.rejects(
      () => repo.updateIsOpen("'; DROP TABLE barbershops; --", false, null),
      /barbershopId/
    );
  });

  test('lança TypeError para closeReason inválido (string arbitrária)', async () => {
    const { repo } = criarRepo();
    await assert.rejects(
      () => repo.updateIsOpen(UUID_SHOP, false, 'qualquer_coisa'),
      /closeReason inválido/
    );
  });

  test('lança TypeError para closeReason com SQL injection', async () => {
    const { repo } = criarRepo();
    await assert.rejects(
      () => repo.updateIsOpen(UUID_SHOP, false, "almoco' OR '1'='1"),
      /closeReason inválido/
    );
  });

  test('lança TypeError para closeReason string vazia', async () => {
    const { repo } = criarRepo();
    await assert.rejects(
      () => repo.updateIsOpen(UUID_SHOP, false, ''),
      /closeReason inválido/
    );
  });

  test('lança Error quando o banco retorna erro', async () => {
    const { repo } = criarRepo({ error: { message: 'connection refused', code: '08000' } });
    await assert.rejects(
      () => repo.updateIsOpen(UUID_SHOP, false, null),
      /updateIsOpen/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StatusFechamentoModal — helpers estáticos puros (sem DOM)
// ─────────────────────────────────────────────────────────────────────────────

// Cria um sandbox mínimo sem document/window — os helpers são métodos estáticos
// puros que não dependem de DOM, por isso são testáveis em Node.js.
function carregarModal() {
  const sandbox = vm.createContext({
    console, Object, String, Set, Error, Promise,
    requestAnimationFrame: fn(),
    document: { body: { appendChild: fn() }, createElement: fn(() => ({ className: '', hidden: false })), addEventListener: fn(), removeEventListener: fn() },
  });
  carregar(sandbox, 'shared/js/StatusFechamentoModal.js');
  return sandbox.StatusFechamentoModal;
}

suite('StatusFechamentoModal.labelStatus()', () => {
  const M = carregarModal();

  test('retorna "Aberta" quando is_open=true', () => {
    assert.strictEqual(M.labelStatus(true, null), 'Aberta');
  });

  test('retorna "Aberta" quando is_open=true mesmo com closeReason preenchido', () => {
    assert.strictEqual(M.labelStatus(true, 'almoco'), 'Aberta');
  });

  test('retorna "Fechada" quando is_open=false e closeReason=null', () => {
    assert.strictEqual(M.labelStatus(false, null), 'Fechada');
  });

  test('retorna "Pausa para Almoço" quando is_open=false e closeReason=almoco', () => {
    assert.strictEqual(M.labelStatus(false, 'almoco'), 'Pausa para Almoço');
  });

  test('retorna "Pausa para Janta" quando is_open=false e closeReason=janta', () => {
    assert.strictEqual(M.labelStatus(false, 'janta'), 'Pausa para Janta');
  });

  test('é case-insensitive: ALMOCO equivale a almoco', () => {
    assert.strictEqual(M.labelStatus(false, 'ALMOCO'), 'Pausa para Almoço');
  });

  test('closeReason desconhecido: retorna "Fechada" (fallback seguro)', () => {
    assert.strictEqual(M.labelStatus(false, 'ferias'), 'Fechada');
  });
});

suite('StatusFechamentoModal.classeStatus()', () => {
  const M = carregarModal();

  test('retorna status--aberta quando is_open=true', () => {
    assert.strictEqual(M.classeStatus(true, null), 'status--aberta');
  });

  test('retorna status--fechada quando is_open=false sem motivo', () => {
    assert.strictEqual(M.classeStatus(false, null), 'status--fechada');
  });

  test('retorna status--pausa para almoco', () => {
    assert.strictEqual(M.classeStatus(false, 'almoco'), 'status--pausa');
  });

  test('retorna status--pausa para janta', () => {
    assert.strictEqual(M.classeStatus(false, 'janta'), 'status--pausa');
  });

  test('retorna status--fechada para closeReason desconhecido', () => {
    assert.strictEqual(M.classeStatus(false, 'qualquer'), 'status--fechada');
  });
});

suite('StatusFechamentoModal.classBadge()', () => {
  const M = carregarModal();

  test('retorna bp-badge--open quando is_open=true', () => {
    assert.strictEqual(M.classBadge(true, null), 'bp-badge--open');
  });

  test('retorna bp-badge--closed quando is_open=false sem motivo', () => {
    assert.strictEqual(M.classBadge(false, null), 'bp-badge--closed');
  });

  test('retorna bp-badge--pausa para almoco', () => {
    assert.strictEqual(M.classBadge(false, 'almoco'), 'bp-badge--pausa');
  });

  test('retorna bp-badge--pausa para janta', () => {
    assert.strictEqual(M.classBadge(false, 'janta'), 'bp-badge--pausa');
  });

  test('retorna bp-badge--closed para closeReason desconhecido (fallback seguro)', () => {
    assert.strictEqual(M.classBadge(false, 'indefinido'), 'bp-badge--closed');
  });
});
