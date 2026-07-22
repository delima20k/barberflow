'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

function criarAuthService(signUpData) {
  const signUp = fn().mockResolvedValue(signUpData);
  const dispatchEvent = fn();
  const sandbox = vm.createContext({
    console,
    window: { location: { pathname: '/apps/cliente/' } },
    document: { dispatchEvent },
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    InputValidator: {
      nome: () => ({ ok: true }),
      email: () => ({ ok: true }),
      senha: () => ({ ok: true }),
      senhasConferem: () => ({ ok: true }),
      todos: (results) => results.find(result => !result.ok) ?? { ok: true },
    },
    SupabaseService: {
      signUp,
      profiles: () => ({ upsert: fn() }),
      barbershops: () => ({ insert: fn() }),
    },
    BffApiService: { auth: { salvarDocumento: fn() } },
    LoggerService: { warn: fn(), error: fn() },
    setTimeout: fn(),
  });
  carregar(sandbox, 'shared/js/AuthService.js');
  return { AuthService: sandbox.AuthService, signUp };
}

async function cadastrar(AuthService, mensagens, navegacoes) {
  await AuthService.cadastro({
    nome: 'Pessoa Teste',
    email: 'existente@barberflow.live',
    telefone: '',
    senha: 'Senha123',
    senha2: 'Senha123',
    role: 'client',
  }, tela => navegacoes.push(tela), (msg, tipo) => mensagens.push({ msg, tipo }));
}

describe('AuthService.cadastro - email duplicado ofuscado pelo Supabase', () => {
  test('bloqueia usuario confirmado com identities vazio', async () => {
    const { AuthService } = criarAuthService({
      user: { id: 'fake-user-id', identities: [] },
      session: null,
    });
    const mensagens = [];
    const navegacoes = [];

    await cadastrar(AuthService, mensagens, navegacoes);

    assert.deepStrictEqual(mensagens.at(-1), {
      msg: 'Este e-mail já está cadastrado.',
      tipo: 'error',
    });
    assert.strictEqual(navegacoes.length, 0);
  });

  test('mantem cadastro novo aguardando confirmacao quando existe identidade', async () => {
    const { AuthService } = criarAuthService({
      user: { id: 'new-user-id', identities: [{ identity_id: 'new-identity-id' }] },
      session: null,
    });
    const mensagens = [];
    const navegacoes = [];

    await cadastrar(AuthService, mensagens, navegacoes);

    assert.deepStrictEqual(mensagens.at(-1), {
      msg: '✅ Cadastro realizado! Verifique seu e-mail para confirmar.',
      tipo: 'success',
    });
    assert.strictEqual(navegacoes.length, 0);
  });
});
