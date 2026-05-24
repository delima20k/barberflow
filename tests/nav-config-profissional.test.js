'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { describe, test } = require('node:test');

const { carregar } = require('./_helpers');

function criarSandboxProfissional({ proType = 'barbearia' } = {}) {
  const sandbox = vm.createContext({
    console,
    Pro: {},
    AuthService: {
      getPerfil: () => ({ pro_type: proType }),
      _instancia: () => sandbox.Pro,
    },
  });

  carregar(sandbox, 'shared/js/NavConfig.js');
  return sandbox;
}

function criarSandboxCliente() {
  const sandbox = vm.createContext({
    console,
    App: {},
    AuthService: {
      getPerfil: () => ({ role: 'client' }),
      _instancia: () => sandbox.App,
    },
  });

  carregar(sandbox, 'shared/js/NavConfig.js');
  return sandbox;
}

describe('NavConfig app profissional', () => {
  test('deve exibir Financas no menu logado mesmo quando BarberFlowProfissional nao e global', () => {
    const sandbox = criarSandboxProfissional({ proType: 'barbearia' });

    const html = sandbox.NavConfig.renderMenuHtml(true);

    assert.match(html, /data-tela="financas"/);
    assert.match(html, /Finan/);
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
});
