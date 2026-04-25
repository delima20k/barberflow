'use strict';
/**
 * tests/domain.test.js
 *
 * Testa as entidades de domínio: Barbearia, Profissional, Servico.
 * Segue o padrão de entities.test.js: CJS + sandbox VM + carregar().
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

const UUID = 'b0000000-0000-4000-8000-000000000001';

function criarSandbox() {
  const sandbox = vm.createContext({ console, Error, TypeError });
  carregar(sandbox, 'shared/js/Barbearia.js');
  carregar(sandbox, 'shared/js/Profissional.js');
  carregar(sandbox, 'shared/js/Servico.js');
  return sandbox;
}

// ─────────────────────────────────────────────────────────────────────────────
// Barbearia — validar()
// ─────────────────────────────────────────────────────────────────────────────
suite('Barbearia — validar()', () => {
  let sb;
  test('setup', () => { sb = criarSandbox(); });

  test('rejeita nome vazio', () => {
    const b = sb.Barbearia.fromRow({ name: '', owner_id: UUID, city: 'SP' });
    const r = b.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /nome/i.test(e)));
  });

  test('rejeita owner_id ausente', () => {
    const b = sb.Barbearia.fromRow({ name: 'Barbearia Top', city: 'SP' });
    const r = b.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /proprietário/i.test(e)));
  });

  test('rejeita latitude sem longitude', () => {
    const b = sb.Barbearia.fromRow({ name: 'Barbearia Top', owner_id: UUID, city: 'SP', lat: -23.5 });
    const r = b.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /longitude/i.test(e)));
  });

  test('aceita dados completos e válidos', () => {
    const b = sb.Barbearia.fromRow({
      name: 'Corte & Cia', owner_id: UUID, city: 'São Paulo',
      lat: -23.5505, lng: -46.6333,
    });
    const r = b.validar();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.erros.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Barbearia — métodos internos
// ─────────────────────────────────────────────────────────────────────────────
suite('Barbearia — métodos internos', () => {
  let sb;
  test('setup', () => { sb = criarSandbox(); });

  test('possuiLocalizacao() retorna true quando lat e lng estão definidos', () => {
    const b = sb.Barbearia.fromRow({ lat: -23.5505, lng: -46.6333 });
    assert.strictEqual(b.possuiLocalizacao(), true);
  });

  test('possuiLocalizacao() retorna false sem coordenadas', () => {
    const b = sb.Barbearia.fromRow({});
    assert.strictEqual(b.possuiLocalizacao(), false);
  });

  test('isAtiva() reflete is_active do row', () => {
    assert.strictEqual(sb.Barbearia.fromRow({ is_active: true  }).isAtiva(), true);
    assert.strictEqual(sb.Barbearia.fromRow({ is_active: false }).isAtiva(), false);
  });

  test('toJSON() retorna campos corretos', () => {
    const b = sb.Barbearia.fromRow({ name: 'Minha Barbearia', city: 'RJ', is_active: true });
    const j = b.toJSON();
    assert.strictEqual(j.name, 'Minha Barbearia');
    assert.strictEqual(j.city, 'RJ');
    assert.strictEqual(j.is_active, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Profissional — validar()
// ─────────────────────────────────────────────────────────────────────────────
suite('Profissional — validar()', () => {
  let sb;
  test('setup', () => { sb = criarSandbox(); });

  test('rejeita user_id ausente', () => {
    const p = sb.Profissional.fromRow({ full_name: 'Carlos', role: 'barber' });
    const r = p.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /usuário/i.test(e)));
  });

  test('rejeita nome vazio', () => {
    const p = sb.Profissional.fromRow({ user_id: UUID, full_name: '', role: 'barber' });
    const r = p.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /nome/i.test(e)));
  });

  test('rejeita role inválido', () => {
    const p = sb.Profissional.fromRow({ user_id: UUID, full_name: 'Carlos', role: 'admin' });
    const r = p.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /role/i.test(e)));
  });

  test('aceita dados completos com role válido', () => {
    for (const role of ['barber', 'owner', 'manager']) {
      const p = sb.Profissional.fromRow({ user_id: UUID, full_name: 'Carlos', role });
      assert.strictEqual(p.validar().ok, true, `role '${role}' deveria ser válido`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Profissional — métodos internos
// ─────────────────────────────────────────────────────────────────────────────
suite('Profissional — métodos internos', () => {
  let sb;
  test('setup', () => { sb = criarSandbox(); });

  test('isAtivo() reflete is_active do row', () => {
    assert.strictEqual(sb.Profissional.fromRow({ is_active: true  }).isAtivo(), true);
    assert.strictEqual(sb.Profissional.fromRow({ is_active: false }).isAtivo(), false);
  });

  test('toJSON() preserva todos os campos', () => {
    const p = sb.Profissional.fromRow({
      user_id: UUID, barbershop_id: UUID, full_name: 'Carlos', role: 'barber', is_active: true,
    });
    const j = p.toJSON();
    assert.strictEqual(j.user_id, UUID);
    assert.strictEqual(j.full_name, 'Carlos');
    assert.strictEqual(j.role, 'barber');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Servico — validar()
// ─────────────────────────────────────────────────────────────────────────────
suite('Servico — validar()', () => {
  let sb;
  test('setup', () => { sb = criarSandbox(); });

  test('rejeita nome vazio', () => {
    const s = sb.Servico.fromRow({ barbershop_id: UUID, name: '' });
    const r = s.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /nome/i.test(e)));
  });

  test('rejeita preço negativo', () => {
    const s = sb.Servico.fromRow({ barbershop_id: UUID, name: 'Corte', price: -1 });
    const r = s.validar();
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some(e => /negativo/i.test(e)));
  });

  test('rejeita duration_min zero ou negativo', () => {
    const s0 = sb.Servico.fromRow({ barbershop_id: UUID, name: 'Corte', duration_min: 0 });
    const sn = sb.Servico.fromRow({ barbershop_id: UUID, name: 'Corte', duration_min: -5 });
    assert.strictEqual(s0.validar().ok, false);
    assert.strictEqual(sn.validar().ok, false);
  });

  test('aceita dados completos e válidos', () => {
    const s = sb.Servico.fromRow({
      barbershop_id: UUID, name: 'Corte Degradê', price: 45.0, duration_min: 30,
    });
    assert.strictEqual(s.validar().ok, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Servico — métodos internos
// ─────────────────────────────────────────────────────────────────────────────
suite('Servico — métodos internos', () => {
  let sb;
  test('setup', () => { sb = criarSandbox(); });

  test('isAtivo() reflete is_active do row', () => {
    assert.strictEqual(sb.Servico.fromRow({ is_active: true  }).isAtivo(), true);
    assert.strictEqual(sb.Servico.fromRow({ is_active: false }).isAtivo(), false);
  });

  test('temPreco() retorna true quando price é número', () => {
    assert.strictEqual(sb.Servico.fromRow({ price: 0 }).temPreco(), true);
    assert.strictEqual(sb.Servico.fromRow({ price: 50 }).temPreco(), true);
  });

  test('temPreco() retorna false quando price é null ou ausente', () => {
    assert.strictEqual(sb.Servico.fromRow({ price: null }).temPreco(), false);
    assert.strictEqual(sb.Servico.fromRow({}).temPreco(), false);
  });

  test('fromRow(null) não lança exceção', () => {
    assert.doesNotThrow(() => sb.Servico.fromRow(null));
    assert.doesNotThrow(() => sb.Servico.fromRow(undefined));
  });

  test('toJSON() retorna campos corretos', () => {
    const s = sb.Servico.fromRow({
      barbershop_id: UUID, name: 'Barba', price: 30, duration_min: 20, is_active: true,
    });
    const j = s.toJSON();
    assert.strictEqual(j.name, 'Barba');
    assert.strictEqual(j.price, 30);
    assert.strictEqual(j.duration_min, 20);
  });
});
