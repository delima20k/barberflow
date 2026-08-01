'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

class AuthServiceFixture {
  static load() {
    const context = vm.createContext({
      globalThis: {},
      sessionStorage: new MemoryStorage(),
    });
    context.globalThis.sessionStorage = context.sessionStorage;
    const root = path.resolve(__dirname, '..');
    ['config/runtime-config.js', 'config/admin-config.js', 'services/AuthService.js']
      .forEach((relativePath) => vm.runInContext(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        context,
      ));
    return context.globalThis;
  }
}

describe('AuthService', () => {
  it('deve bloquear acesso sem sessao mesmo em modo demonstracao', async () => {
    const { AuthService } = AuthServiceFixture.load();
    const service = new AuthService();

    assert.equal(await service.isAuthenticated(), false);
  });

  it('deve aceitar apenas a credencial explicitamente demonstrativa', async () => {
    const { AuthService } = AuthServiceFixture.load();
    const service = new AuthService();

    const denied = await service.signIn('admin@barberflow.live', 'qualquer-senha');
    const accepted = await service.signIn('demo@analytics.local', 'analytics-demo');

    assert.equal(denied.ok, false);
    assert.equal(accepted.ok, true);
    assert.equal(await service.isAuthenticated(), true);
  });

  it('deve bloquear usuário autenticado fora da allowlist ativa', async () => {
    const { AuthService } = AuthServiceFixture.load();
    let signedOut = false;
    const client = {
      auth: {
        signInWithPassword: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
        signOut: async () => { signedOut = true; },
      },
      schema(name) {
        assert.equal(name, 'analytics');
        return { rpc: async () => ({ data: false, error: null }) };
      },
    };
    const service = new AuthService(client, new MemoryStorage(), { isDemo: () => false });

    const result = await service.signIn('user@barberflow.live', 'senha-valida');

    assert.equal(result.ok, false);
    assert.equal(signedOut, true);
  });

  it('deve autorizar somente administrador ativo após o Auth compartilhado', async () => {
    const { AuthService } = AuthServiceFixture.load();
    const client = {
      auth: {
        signInWithPassword: async () => ({ data: { user: { id: 'admin-1' } }, error: null }),
      },
      schema: () => ({ rpc: async () => ({ data: true, error: null }) }),
    };
    const service = new AuthService(client, new MemoryStorage(), { isDemo: () => false });

    assert.equal((await service.signIn('admin@barberflow.live', 'senha-valida')).ok, true);
  });
});
