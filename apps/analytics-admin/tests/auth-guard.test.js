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
});
