'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const UUID_CLIENTE      = 'c0000000-0000-4000-8000-000000000001';
const UUID_PROFISSIONAL = 'c0000000-0000-4000-8000-000000000002';
const UUID_BARBEARIA    = 'c0000000-0000-4000-8000-000000000003';
const UUID_SERVICO      = 'c0000000-0000-4000-8000-000000000004';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sandbox
// ─────────────────────────────────────────────────────────────────────────────

/** Cria sandbox com InputValidator → Cliente → Agendamento. */
function criarSandbox() {
  const sandbox = vm.createContext({ console, Error, TypeError });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/Cliente.js');
  carregar(sandbox, 'shared/js/Agendamento.js');
  return sandbox;
}

/** Data futura (1 hora à frente) como ISO string. */
function futuro() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

/** Payload mínimo válido para Agendamento. */
function payloadAgendamentoValido(extra = {}) {
  return {
    client_id:       UUID_CLIENTE,
    professional_id: UUID_PROFISSIONAL,
    barbershop_id:   UUID_BARBEARIA,
    service_id:      UUID_SERVICO,
    scheduled_at:    futuro(),
    duration_min:    30,
    status:          'pending',
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

suite('Cliente — validar()', () => {

  test('nome vazio → ok: false com mensagem de erro', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ full_name: '' });
    const { ok, erros } = c.validar();
    assert.equal(ok, false);
    assert.ok(erros.length > 0, 'deve haver pelo menos um erro');
  });

  test('nome válido sem telefone → ok: true', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ full_name: 'João Silva', phone: null });
    const { ok, erros } = c.validar();
    assert.equal(ok, true, `erros: ${erros}`);
    assert.equal(erros.length, 0);
  });

  test('telefone com formato inválido → ok: false', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ full_name: 'João', phone: 'abc-xyz' });
    const { ok, erros } = c.validar();
    assert.equal(ok, false);
    assert.ok(erros.some((e) => e.toLowerCase().includes('tel')), `erros: ${erros}`);
  });

  test('nome válido + telefone válido → ok: true', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ full_name: 'João Silva', phone: '11991234567' });
    const { ok, erros } = c.validar();
    assert.equal(ok, true, `erros: ${erros}`);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('Cliente — métodos internos', () => {

  test('isAtivo() retorna false quando is_active=false', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ is_active: false });
    assert.equal(c.isAtivo(), false);
  });

  test('possuiLocalizacao() retorna true quando cep presente', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ zip_code: '01310100' });
    assert.equal(c.possuiLocalizacao(), true);
  });

  test('possuiLocalizacao() retorna false quando cep ausente', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ zip_code: null });
    assert.equal(c.possuiLocalizacao(), false);
  });

  test('nomeCompleto() capitaliza cada palavra e remove espaços extras', () => {
    const sb = criarSandbox();
    const c  = sb.Cliente.fromRow({ full_name: '  joão  da  silva  ' });
    assert.equal(c.nomeCompleto(), 'João Da Silva');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('Agendamento — validar()', () => {

  test('payload válido → ok: true', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(payloadAgendamentoValido());
    const { ok, erros } = ag.validar();
    assert.equal(ok, true, `erros: ${erros}`);
  });

  test('scheduled_at no passado → erro de data', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(
      payloadAgendamentoValido({ scheduled_at: '2020-01-01T00:00:00Z' }),
    );
    const { ok, erros } = ag.validar();
    assert.equal(ok, false);
    assert.ok(erros.some((e) => e.includes('scheduled_at')), `erros: ${erros}`);
  });

  test('status inválido → erro de status', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(
      payloadAgendamentoValido({ status: 'voando' }),
    );
    const { ok, erros } = ag.validar();
    assert.equal(ok, false);
    assert.ok(erros.some((e) => e.includes('status')), `erros: ${erros}`);
  });

  test('client_id ausente (null) → erro de UUID', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(
      payloadAgendamentoValido({ client_id: null }),
    );
    const { ok, erros } = ag.validar();
    assert.equal(ok, false);
    assert.ok(erros.some((e) => e.includes('client_id')), `erros: ${erros}`);
  });

  test('duration_min fora do intervalo (0) → erro de duração', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(
      payloadAgendamentoValido({ duration_min: 0 }),
    );
    const { ok, erros } = ag.validar();
    assert.equal(ok, false);
    assert.ok(erros.some((e) => e.includes('duration_min')), `erros: ${erros}`);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('Agendamento — métodos internos', () => {

  test('isPendente() retorna true para status pending', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(payloadAgendamentoValido({ status: 'pending' }));
    assert.equal(ag.isPendente(), true);
    assert.equal(ag.isConfirmado(), false);
  });

  test('isCancelado() retorna true para cancelled e no_show', () => {
    const sb = criarSandbox();
    const ag1 = sb.Agendamento.fromRow(payloadAgendamentoValido({ status: 'cancelled' }));
    const ag2 = sb.Agendamento.fromRow(payloadAgendamentoValido({ status: 'no_show' }));
    assert.equal(ag1.isCancelado(), true);
    assert.equal(ag2.isCancelado(), true);
  });

  test('isFuturo() retorna false para data passada', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow({ scheduled_at: '2020-01-01T00:00:00Z' });
    assert.equal(ag.isFuturo(), false);
  });

  test('isFuturo() retorna true para data futura', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow({ scheduled_at: futuro() });
    assert.equal(ag.isFuturo(), true);
  });

});
