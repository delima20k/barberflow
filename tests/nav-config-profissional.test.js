'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { describe, test } = require('node:test');

const { carregar, ROOT } = require('./_helpers');

function criarSandboxProfissional({ proType = 'barbearia', pathname = '/apps/profissional/' } = {}) {
  const sandbox = {
    console,
    window: { location: { pathname } },
    document: {},
    Pro: { nav() {}, navDoMenu() {}, irParaCadastroGuardado() {} },
    AuthService: {
      getPerfil: () => ({ role: 'professional', pro_type: proType }),
      _instancia: () => sandbox.Pro,
      _prefix: () => 'Pro',
    },
  };
  vm.createContext(sandbox);
  carregar(sandbox, 'shared/js/NavConfig.js');
  return sandbox;
}

function criarSandboxCliente() {
  const sandbox = {
    console,
    window: { location: { pathname: '/apps/cliente/' } },
    document: {},
    App: { nav() {}, navDoMenu() {} },
    AuthService: {
      getPerfil: () => ({ role: 'client' }),
      _instancia: () => sandbox.App,
      _prefix: () => 'App',
    },
  };
  vm.createContext(sandbox);
  carregar(sandbox, 'shared/js/NavConfig.js');
  return sandbox;
}

describe('NavConfig app profissional', () => {
  test('deve exibir Financas no menu logado mesmo quando BarberFlowProfissional nao e global', () => {
    const sandbox = criarSandboxProfissional({ proType: 'barbearia' });

    const items = sandbox.NavConfig.getItems(true);

    assert.ok(
      items.some(item => item.tela === 'financas' && item.label.includes('Finan')),
      'menu profissional logado deve incluir a tela financas'
    );
  });

  test('deve renderizar o item Financas apontando para Pro.nav', () => {
    const sandbox = criarSandboxProfissional();

    const html = sandbox.NavConfig.renderMenuHtml(true);

    assert.match(html, /data-tela="financas"/);
    assert.match(html, /Pro\.nav\('financas'\)/);
  });

  test('deve manter Financas para barbeiro autonomo logado', () => {
    const sandbox = criarSandboxProfissional({ proType: 'barbeiro' });

    const items = sandbox.NavConfig.getItems(true);

    assert.ok(items.some(item => item.tela === 'financas'));
  });

  test('nao deve adicionar Financas ao menu do app cliente', () => {
    const sandbox = criarSandboxCliente();

    const items = sandbox.NavConfig.getItems(true);

    assert.equal(items.some(item => item.tela === 'financas'), false);
  });

  test('deve manter a tela e a rota financas registradas no app profissional', () => {
    const indexHtml = readFileSync(join(ROOT, 'apps/profissional/index.html'), 'utf8');
    const appJs = readFileSync(join(ROOT, 'apps/profissional/assets/js/app.js'), 'utf8');

    assert.match(indexHtml, /id="tela-financas"/);
    assert.match(indexHtml, /assets\/js\/pages\/FinancasPage\.js/);
    assert.match(appJs, /'financas'/);
    assert.match(appJs, /new FinancasPage\(\)/);
  });
});
