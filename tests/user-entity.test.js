'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const User            = require('../src/entities/User');

// ─────────────────────────────────────────────────────────────────────────────
// User — fromRow()
// ─────────────────────────────────────────────────────────────────────────────
suite('User — fromRow()', () => {

  test('cria instância com valores padrão quando row é vazia', () => {
    const u = User.fromRow({});
    assert.strictEqual(u.email,    '');
    assert.strictEqual(u.role,     'client');
    assert.strictEqual(u.isActive, true);
    assert.strictEqual(u.id,       null);
  });

  test('cria instância com valores do banco', () => {
    const u = User.fromRow({
      id:       'a0000000-0000-4000-8000-000000000001',
      email:    'joao@example.com',
      role:     'barber',
      is_active: true,
    });
    assert.strictEqual(u.id,    'a0000000-0000-4000-8000-000000000001');
    assert.strictEqual(u.email, 'joao@example.com');
    assert.strictEqual(u.role,  'barber');
  });

  test('fromRow(null) não lança exceção', () => {
    assert.doesNotThrow(() => User.fromRow(null));
  });

  test('armazena passwordHash sem alterar o valor', () => {
    const hash = '$2b$12$abcdefABCDEF1234567890';
    const u    = User.fromRow({ email: 'a@b.com', role: 'client', password_hash: hash });
    assert.strictEqual(u.passwordHash, hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User — validar()
// ─────────────────────────────────────────────────────────────────────────────
suite('User — validar()', () => {

  test('aceita dados mínimos válidos', () => {
    const u = User.fromRow({ email: 'teste@example.com', role: 'client' });
    const { ok, erros } = u.validar();
    assert.strictEqual(ok, true);
    assert.strictEqual(erros.length, 0);
  });

  test('rejeita email vazio', () => {
    const { ok, erros } = User.fromRow({ email: '', role: 'client' }).validar();
    assert.strictEqual(ok, false);
    assert.ok(erros.some(e => /e-?mail/i.test(e)), 'deve mencionar e-mail no erro');
  });

  test('rejeita email sem @', () => {
    const { ok } = User.fromRow({ email: 'nao-e-email', role: 'client' }).validar();
    assert.strictEqual(ok, false);
  });

  test('rejeita role ausente', () => {
    const u = User.fromRow({ email: 'a@b.com', role: '' });
    const { ok, erros } = u.validar();
    assert.strictEqual(ok, false);
    assert.ok(erros.some(e => /role/i.test(e)));
  });

  test('rejeita role fora da allowlist', () => {
    const { ok, erros } = User.fromRow({ email: 'a@b.com', role: 'superadmin' }).validar();
    assert.strictEqual(ok, false);
    assert.ok(erros.some(e => /role/i.test(e)));
  });

  test('aceita todos os roles válidos', () => {
    for (const role of User.rolesValidos) {
      const { ok } = User.fromRow({ email: 'a@b.com', role }).validar();
      assert.strictEqual(ok, true, `role "${role}" deveria ser aceito`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User — métodos de domínio
// ─────────────────────────────────────────────────────────────────────────────
suite('User — métodos de domínio', () => {

  test('isAtivo() retorna true quando is_active=true', () => {
    const u = User.fromRow({ email: 'a@b.com', role: 'client', is_active: true });
    assert.strictEqual(u.isAtivo(), true);
  });

  test('isAtivo() retorna false quando is_active=false', () => {
    const u = User.fromRow({ email: 'a@b.com', role: 'client', is_active: false });
    assert.strictEqual(u.isAtivo(), false);
  });

  test('isEmailVerificado() retorna false sem email_verified_at', () => {
    const u = User.fromRow({ email: 'a@b.com', role: 'client' });
    assert.strictEqual(u.isEmailVerificado(), false);
  });

  test('isEmailVerificado() retorna true com email_verified_at preenchido', () => {
    const u = User.fromRow({
      email:             'a@b.com',
      role:              'client',
      email_verified_at: new Date().toISOString(),
    });
    assert.strictEqual(u.isEmailVerificado(), true);
  });

  test('hasRole() verifica role corretamente', () => {
    const u = User.fromRow({ email: 'a@b.com', role: 'owner' });
    assert.strictEqual(u.hasRole('owner'),  true);
    assert.strictEqual(u.hasRole('barber'), false);
  });

  test('isAdmin() retorna true apenas para role=admin', () => {
    assert.strictEqual(User.fromRow({ email: 'a@b.com', role: 'admin' }).isAdmin(),  true);
    assert.strictEqual(User.fromRow({ email: 'a@b.com', role: 'owner' }).isAdmin(),  false);
    assert.strictEqual(User.fromRow({ email: 'a@b.com', role: 'client' }).isAdmin(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User — toJSON() segurança
// ─────────────────────────────────────────────────────────────────────────────
suite('User — toJSON() nunca expõe passwordHash', () => {

  test('passwordHash ausente do JSON serializado', () => {
    const u    = User.fromRow({ email: 'a@b.com', role: 'client', password_hash: '$2b$12$hash' });
    const json = u.toJSON();
    assert.strictEqual('passwordHash'   in json, false, 'chave passwordHash não deve existir');
    assert.strictEqual('password_hash'  in json, false, 'chave password_hash não deve existir');
  });

  test('JSON contém campos públicos esperados', () => {
    const u    = User.fromRow({ email: 'a@b.com', role: 'client', is_active: true });
    const json = u.toJSON();
    assert.ok('email'     in json);
    assert.ok('role'      in json);
    assert.ok('is_active' in json);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User — rolesValidos estático
// ─────────────────────────────────────────────────────────────────────────────
suite('User — rolesValidos (estático)', () => {

  test('retorna array com os roles esperados', () => {
    const roles = User.rolesValidos;
    assert.ok(Array.isArray(roles));
    for (const r of ['client', 'barber', 'owner', 'manager', 'admin']) {
      assert.ok(roles.includes(r), `role "${r}" deve estar na lista`);
    }
  });

  test('retorna cópia — mutação não afeta a lista interna', () => {
    const r1 = User.rolesValidos;
    r1.push('hacker');
    const r2 = User.rolesValidos;
    assert.ok(!r2.includes('hacker'), 'mutação externa não deve persistir');
  });
});
