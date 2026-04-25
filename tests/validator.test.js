'use strict';
/**
 * tests/validator.test.js
 *
 * Testa o alias público Validator (= InputValidator).
 * Cobre os pontos exigidos pela revisão de segurança:
 *   - email inválido
 *   - telefone inválido
 *   - proteção contra filter injection no PostgREST
 *
 * Não duplica os testes de InputValidator.test.js — foca no alias
 * e nos vetores de segurança pedidos.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

function criarValidator() {
  const sandbox = vm.createContext({ console });
  carregar(sandbox, 'shared/js/InputValidator.js');
  // Validator é o alias const exportado após o fechamento da classe
  return sandbox.Validator;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator.email()
// ─────────────────────────────────────────────────────────────────────────────
suite('Validator.email() — validação', () => {
  let V;
  test('setup', () => { V = criarValidator(); });

  test('rejeita e-mail vazio', () => {
    const r = V.email('');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /obrigatório/i);
  });

  test('rejeita e-mail sem @', () => {
    const r = V.email('usuariobarbearia.com');
    assert.strictEqual(r.ok, false);
  });

  test('rejeita e-mail sem TLD (ex: test@dominio)', () => {
    const r = V.email('test@dominio');
    assert.strictEqual(r.ok, false);
  });

  test('aceita e-mail válido', () => {
    const r = V.email('barbeiro@barbearia.com.br');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.msg, '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator.telefone()
// ─────────────────────────────────────────────────────────────────────────────
suite('Validator.telefone() — validação', () => {
  let V;
  test('setup', () => { V = criarValidator(); });

  test('aceita vazio quando não obrigatório (campo opcional)', () => {
    assert.strictEqual(V.telefone('').ok, true);
    assert.strictEqual(V.telefone(null).ok, true);
  });

  test('rejeita vazio quando obrigatório', () => {
    const r = V.telefone('', true);
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /obrigatório/i);
  });

  test('rejeita número incompleto (dígitos insuficientes)', () => {
    const r = V.telefone('(11) 1234');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /inválido/i);
  });

  test('aceita celular BR (11 dígitos)', () => {
    assert.strictEqual(V.telefone('(11) 91234-5678').ok, true);
    assert.strictEqual(V.telefone('11912345678').ok, true);
  });

  test('aceita fixo BR (10 dígitos)', () => {
    assert.strictEqual(V.telefone('(11) 3456-7890').ok, true);
    assert.strictEqual(V.telefone('1134567890').ok, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator.escaparFiltroPostgREST() — proteção contra filter injection
// ─────────────────────────────────────────────────────────────────────────────
suite('Validator — proteção contra filter injection (PostgREST)', () => {
  let V;
  test('setup', () => { V = criarValidator(); });

  test('remove vírgula (separador de condições OR no PostgREST)', () => {
    // "nome,sobrenome" poderia injetar uma segunda condição OR
    assert.strictEqual(V.escaparFiltroPostgREST('joão,bar'), 'joãobar');
  });

  test('remove parênteses (agrupadores de filtro no PostgREST)', () => {
    // "(test)" poderia escapar o agrupamento e criar subexpressão maliciosa
    assert.strictEqual(V.escaparFiltroPostgREST('(test)'), 'test');
  });
});
