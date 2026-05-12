'use strict';

// =============================================================
// domain-umd.test.js — Paridade e UMD das entidades de domínio
//
// Verifica:
//   1. shared/js/* são carregáveis via require() (padrão UMD)
//   2. src/entities/* thin wrappers retornam a mesma classe
//   3. Novos métodos Agendamento: isEmAndamento, isNoShow,
//      static statusValidos, toJSON snake_case
//   4. src/infra/InputValidator é o mesmo que shared/js/InputValidator
// =============================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

// ── UUIDs de apoio ────────────────────────────────────────────────────────────

const UUID_A = 'a0000000-0000-4000-8000-000000000001';
const UUID_B = 'a0000000-0000-4000-8000-000000000002';
const UUID_C = 'a0000000-0000-4000-8000-000000000003';
const UUID_D = 'a0000000-0000-4000-8000-000000000004';

const futuro = () => new Date(Date.now() + 3_600_000).toISOString();

function agPayload(extra = {}) {
  return {
    client_id:       UUID_A,
    professional_id: UUID_B,
    barbershop_id:   UUID_C,
    service_id:      UUID_D,
    scheduled_at:    futuro(),
    duration_min:    30,
    status:          'pending',
    ...extra,
  };
}

function criarSandbox() {
  const sb = vm.createContext({ console, Error, TypeError });
  carregar(sb, 'shared/js/InputValidator.js');
  carregar(sb, 'shared/js/Agendamento.js');
  return sb;
}

// ─────────────────────────────────────────────────────────────────────────────
// UMD — require() deve funcionar após conversão
// ─────────────────────────────────────────────────────────────────────────────

suite('UMD — require() carrega shared/js/*', () => {

  test('InputValidator tem métodos esperados via require()', () => {
    const IV = require('../shared/js/InputValidator');
    assert.equal(typeof IV.uuid,                    'function');
    assert.equal(typeof IV.email,                   'function');
    assert.equal(typeof IV.sanitizar,               'function');
    assert.equal(typeof IV.escaparFiltroPostgREST,  'function');
    assert.equal(typeof IV.textoLivre,              'function');
    assert.equal(typeof IV.enumValido,              'function');
    assert.equal(typeof IV.payload,                 'function');
  });

  test('Agendamento via require() — fromRow + validar', () => {
    const Ag = require('../shared/js/Agendamento');
    const ag = Ag.fromRow(agPayload());
    const { ok, erros } = ag.validar();
    assert.equal(ok, true, `erros inesperados: ${erros}`);
  });

  test('Barbearia via require() — fromRow + isAtiva', () => {
    const B = require('../shared/js/Barbearia');
    const b = B.fromRow({ name: 'Corte Total', owner_id: UUID_A, city: 'SP' });
    assert.equal(b.isAtiva(), true);
    assert.equal(b.name, 'Corte Total');
  });

  test('Profissional via require() — fromRow + isOwner + isBarber', () => {
    const P = require('../shared/js/Profissional');
    const p = P.fromRow({ user_id: UUID_A, full_name: 'João', role: 'owner' });
    assert.equal(p.isOwner(),  true);
    assert.equal(p.isBarber(), false);
  });

  test('Servico via require() — fromRow + temPreco + isAtivo', () => {
    const S = require('../shared/js/Servico');
    const s = S.fromRow({ name: 'Corte simples', barbershop_id: UUID_A, price: 30, duration_min: 30 });
    assert.equal(s.temPreco(), true);
    assert.equal(s.isAtivo(),  true);
  });

  test('Cliente via require() — fromRow + nomeCompleto', () => {
    const C = require('../shared/js/Cliente');
    const c = C.fromRow({ full_name: 'maria da silva' });
    assert.equal(c.nomeCompleto(), 'Maria Da Silva');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Thin wrappers — src/entities/* e src/infra/InputValidator
// ─────────────────────────────────────────────────────────────────────────────

suite('Thin wrappers src/* → mesma referência que shared/js/*', () => {

  test('src/entities/Agendamento === shared/js/Agendamento', () => {
    const Shared  = require('../shared/js/Agendamento');
    const Backend = require('../src/entities/Agendamento');
    assert.strictEqual(Shared, Backend,
      'src/entities/Agendamento deve ser thin wrapper de shared/js/Agendamento');
  });

  test('src/entities/Barbearia === shared/js/Barbearia', () => {
    assert.strictEqual(
      require('../shared/js/Barbearia'),
      require('../src/entities/Barbearia'),
    );
  });

  test('src/entities/Profissional === shared/js/Profissional', () => {
    assert.strictEqual(
      require('../shared/js/Profissional'),
      require('../src/entities/Profissional'),
    );
  });

  test('src/entities/Servico === shared/js/Servico', () => {
    assert.strictEqual(
      require('../shared/js/Servico'),
      require('../src/entities/Servico'),
    );
  });

  test('src/entities/Cliente === shared/js/Cliente', () => {
    assert.strictEqual(
      require('../shared/js/Cliente'),
      require('../src/entities/Cliente'),
    );
  });

  test('src/infra/InputValidator === shared/js/InputValidator', () => {
    assert.strictEqual(
      require('../shared/js/InputValidator'),
      require('../src/infra/InputValidator'),
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Agendamento — novos métodos
// ─────────────────────────────────────────────────────────────────────────────

suite('Agendamento — isEmAndamento, isNoShow, statusValidos, toJSON snake_case', () => {

  test('isEmAndamento() retorna true para in_progress', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(agPayload({ status: 'in_progress' }));
    assert.equal(ag.isEmAndamento(), true);
    assert.equal(ag.isConcluido(),   false);
    assert.equal(ag.isPendente(),    false);
  });

  test('isNoShow() retorna true para no_show', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(agPayload({ status: 'no_show' }));
    assert.equal(ag.isNoShow(),   true);
    assert.equal(ag.isCancelado(), true,  'isCancelado ainda deve incluir no_show');
    assert.equal(ag.isEmAndamento(), false);
  });

  test('static statusValidos retorna os 6 status', () => {
    const sb   = criarSandbox();
    const lista = sb.Agendamento.statusValidos;
    assert.ok(Array.isArray(lista), 'deve ser Array');
    assert.equal(lista.length, 6);
    for (const s of ['pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show']) {
      assert.ok(lista.includes(s), `falta status: ${s}`);
    }
  });

  test('toJSON() retorna chaves snake_case', () => {
    const sb   = criarSandbox();
    const ag   = sb.Agendamento.fromRow(agPayload());
    const json = ag.toJSON();
    assert.ok('client_id'       in json, 'deve ter client_id');
    assert.ok('professional_id' in json, 'deve ter professional_id');
    assert.ok('barbershop_id'   in json, 'deve ter barbershop_id');
    assert.ok('service_id'      in json, 'deve ter service_id');
    assert.ok('scheduled_at'    in json, 'deve ter scheduled_at');
    assert.ok('duration_min'    in json, 'deve ter duration_min');
    assert.ok(!('clientId'       in json), 'NÃO deve ter clientId camelCase');
    assert.ok(!('professionalId' in json), 'NÃO deve ter professionalId camelCase');
  });

  test('validar() com duration_min null → erro obrigatório', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(agPayload({ duration_min: null }));
    const { ok, erros } = ag.validar();
    assert.equal(ok, false);
    assert.ok(erros.some(e => e.includes('duration_min')), `erros: ${erros}`);
  });

  test('validar() com duration_min=0 → erro de intervalo', () => {
    const sb = criarSandbox();
    const ag = sb.Agendamento.fromRow(agPayload({ duration_min: 0 }));
    const { ok, erros } = ag.validar();
    assert.equal(ok, false);
    assert.ok(erros.some(e => e.includes('duration_min')), `erros: ${erros}`);
  });

});
