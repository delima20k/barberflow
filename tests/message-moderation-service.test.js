'use strict';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { carregar } = require('./_helpers.js');

function criarSandbox() {
  const sb = vm.createContext({ console, Error, Set, RegExp, String });
  carregar(sb, 'shared/js/MessageModerationService.js');
  return sb;
}

describe('MessageModerationService — verificar()', () => {
  let sb;

  before(() => { sb = criarSandbox(); });

  test('texto limpo não é bloqueado', () => {
    const { bloqueado } = sb.MessageModerationService.verificar('Olá, tudo bem?');
    assert.equal(bloqueado, false);
  });

  test('texto vazio não é bloqueado', () => {
    const { bloqueado } = sb.MessageModerationService.verificar('');
    assert.equal(bloqueado, false);
  });

  test('null não é bloqueado', () => {
    const { bloqueado } = sb.MessageModerationService.verificar(null);
    assert.equal(bloqueado, false);
  });

  test('palavrão bloqueia com motivo conteudo_ofensivo', () => {
    const r = sb.MessageModerationService.verificar('que merda isso');
    assert.equal(r.bloqueado, true);
    assert.equal(r.motivo, 'conteudo_ofensivo');
  });

  test('xingamento em caixa alta ainda bloqueia', () => {
    const r = sb.MessageModerationService.verificar('SEU IDIOTA');
    assert.equal(r.bloqueado, true);
  });

  test('link externo bloqueia com motivo conteudo_nao_permitido', () => {
    const r = sb.MessageModerationService.verificar('acesse http://spam.com agora');
    assert.equal(r.bloqueado, true);
    assert.equal(r.motivo, 'conteudo_nao_permitido');
  });

  test('www. bloqueia', () => {
    const r = sb.MessageModerationService.verificar('vai em www.site.com');
    assert.equal(r.bloqueado, true);
  });

  test('repetição excessiva de caractere bloqueia', () => {
    const r = sb.MessageModerationService.verificar('aaaaaaaaaaaaa');
    assert.equal(r.bloqueado, true);
  });

  test('mensagem de agendamento normal não é bloqueada', () => {
    const r = sb.MessageModerationService.verificar('Olá, quero agendar um corte para amanhã às 14h');
    assert.equal(r.bloqueado, false);
  });

  test('retorna objeto com shape correto', () => {
    const r = sb.MessageModerationService.verificar('oi');
    assert.ok('bloqueado' in r, 'deve ter campo bloqueado');
  });
});
